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
} from "../src/rooms.js";

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
  assert.equal(availableSeats({ ...room, total_capacity: null }, now, 60), null);
  const crowded = { ...room, latest_reading: { ...room.latest_reading, people_count: 9 } };
  assert.equal(availableSeats(crowded, now, 60), 0);
  assert.equal(crowded.latest_reading.people_count, 9);
  assert.equal(freshness(room, now + 60000, 60), "live");
  assert.equal(freshness(room, now + 60001, 60), "delayed");
});

test("sound values preserve explicit units and missing is distinct from zero", () => {
  assert.equal(formatNoise({ noise_level: 0, noise_unit: "relative" }), "0% relative sound level");
  assert.equal(formatNoise({ noise_level: 42.3, noise_unit: "dBA" }), "42 dBA");
  assert.equal(formatNoise({ noise_level: null }), "—");
  assert.equal(noiseBand({ noise_level: 0, noise_unit: "relative" }).label, "Quiet");
});
