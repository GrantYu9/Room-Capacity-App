import test from "node:test";
import assert from "node:assert/strict";
import { locationLabel } from "../src/rooms.js";
import {
  availableSeats,
  freshness,
  formatNoise,
  noiseBand,
  roomState,
  sampleRooms,
  noiseReading,
  occupancyReading,
  timeAgo,
  hasRecentReading,
} from "../src/rooms.js";

test('noise-only community freshness never revives stale occupancy or static demos', () => {
  const now = Date.now();
  const stale = { ...sampleRooms(now - 3600000)[0], stale: true };
  const room = { ...stale, estimate: { noise: { noise_band: 'quiet', expires_at: new Date(now + 1000).toISOString() } } };
  assert.equal(hasRecentReading(room, now, 60), true);
  assert.equal(availableSeats(room, now, 60), null);
  assert.equal(hasRecentReading(room, now + 1000, 60), false);
  assert.equal(hasRecentReading({ ...stale, latest_reading: { ...stale.latest_reading, device_id: 'demo-old' } }, now, 60), false);
});

test("unknown capacity stays unknown; stale counts are not treated as available seats", () => {
  const now = Date.now();
  const room = sampleRooms(now)[0];
  assert.equal(availableSeats(room, now, 60), 11);
  assert.equal(
    availableSeats({ ...room, total_capacity: null }, now, 60),
    null,
  );
  assert.equal(availableSeats(room, now + 61000, 60), null);
  assert.equal(
    freshness({ ...room, latest_reading: null }, now, 60),
    "waiting",
  );
  assert.equal(roomState(room, now + 61000, 60).key, "delayed");
  assert.equal(availableSeats({ ...room, total_capacity: 2 }, now, 60), 0);
});

test("noise bands use the supplied unit and never treat missing readings as quiet", () => {
  assert.equal(noiseBand(null), null);
  assert.equal(
    noiseBand({ noise_level: 0.2, noise_unit: "relative" }).level,
    "quiet",
  );
  assert.equal(
    noiseBand({ noise_level: 55, noise_unit: "dBA" }).level,
    "moderate",
  );
  assert.equal(
    noiseBand({ noise_level: 75, noise_unit: "dBA" }).level,
    "lively",
  );
});

test("a known address or coordinates are displayed when a building name is missing", () => {
  assert.equal(
    locationLabel({ building: "Learning Centre", room_number: "201" }),
    "Learning Centre · Room 201",
  );
  assert.equal(
    locationLabel({ address: "123 Example Street" }),
    "123 Example Street",
  );
  assert.equal(locationLabel({ latitude: 0, longitude: 0 }), "0.0000, 0.0000");
  assert.equal(locationLabel({ latitude: null, longitude: null }), "");
});

test("zero people and over-capacity estimates retain their counts and clamp seats", () => {
  const now = Date.now();
  const room = sampleRooms(now)[3];
  assert.equal(room.latest_reading.people_count, 0);
  assert.equal(availableSeats(room, now, 60), 6);
  assert.equal(roomState(room, now, 60).label, "No people detected");
  assert.equal(
    availableSeats({ ...room, total_capacity: null }, now, 60),
    null,
  );
  const crowded = {
    ...room,
    latest_reading: { ...room.latest_reading, people_count: 9 },
  };
  assert.equal(availableSeats(crowded, now, 60), 0);
  assert.equal(crowded.latest_reading.people_count, 9);
  assert.equal(freshness(room, now + 60000, 60), "live");
  assert.equal(freshness(room, now + 60001, 60), "delayed");
});

test("sound values preserve explicit units and missing is distinct from zero", () => {
  assert.equal(
    formatNoise({ noise_level: 0, noise_unit: "relative" }),
    "0% relative sound level",
  );
  assert.equal(formatNoise({ noise_level: 42.3, noise_unit: "dBA" }), "42 dBA");
  assert.equal(formatNoise({ noise_level: null }), "—");
  assert.equal(
    noiseBand({ noise_level: 0, noise_unit: "relative" }).label,
    "Quiet",
  );
});

test("partial metrics never invent people counts and malformed timestamps are not fresh", () => {
  const now = Date.now();
  const room = sampleRooms(now)[0];
  const noiseOnly = {
    ...room,
    latest_reading: { ...room.latest_reading, people_count: null },
  };
  assert.equal(availableSeats(noiseOnly, now, 60), null);
  assert.equal(freshness(noiseOnly, now, 60), "live");
  assert.equal(
    freshness(
      {
        ...room,
        latest_reading: { ...room.latest_reading, measured_at: "invalid" },
      },
      now,
      60,
    ),
    "delayed",
  );
});

test("measurement strings and last-checked numeric timestamps share age formatting", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  assert.equal(timeAgo(now - 15000, now), "15s ago");
  assert.equal(timeAgo(new Date(now - 15000).toISOString(), now), "15s ago");
  assert.equal(timeAgo("invalid", now), "Time unavailable");
});

test('static database demos stay visible while real sensors and community estimates still expire', () => {
  const now = Date.now();
  const original = sampleRooms(now - 86400000)[0];
  const room = { ...original, stale: true, latest_reading: { ...original.latest_reading, device_id: 'demo-fixture' } };
  assert.equal(freshness(room, now, 60), 'demo');
  assert.equal(roomState(room, now, 60).label, 'Static demo data');
  assert.equal(availableSeats(room, now, 60), 11);
  assert.equal(noiseReading(room, now, 60).noise_level, 0.12);
  const expiry = new Date(now + 1000).toISOString();
  const reported = { ...room, estimate: {
    occupancy: { people_count: 7, expires_at: expiry },
    noise: { noise_band: 'moderate', expires_at: expiry },
  } };
  assert.equal(occupancyReading(reported, now).people_count, 7);
  assert.equal(noiseReading(reported, now, 60).noise_band, 'moderate');
  assert.equal(freshness(reported, now + 2000, 60), 'demo');
  assert.equal(occupancyReading(reported, now + 2000).people_count, 5);
  const sensor = { ...room, latest_reading: { ...room.latest_reading, device_id: 'pi-1' } };
  assert.equal(freshness(sensor, now, 60), 'delayed');
  assert.equal(availableSeats(sensor, now, 60), null);
  assert.equal(noiseReading(sensor, now, 60), null);
});
