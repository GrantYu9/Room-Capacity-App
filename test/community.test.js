import test from 'node:test';
import assert from 'node:assert/strict';
import { communityEstimate, REPORT_WINDOW_MS } from '../server/community.js';
import { validateReport } from '../server/validation.js';
import { presentRoom } from '../server/store.js';
import { freshness, availableSeats, noiseReading, noiseBand, occupancyReading } from '../src/rooms.js';

const now = Date.parse('2026-11-08T06:00:00Z');
const room = { room_id: 'room', total_capacity: 100, latest_reading: {
  device_id: 'pi-1', measured_at: new Date(now - 1000).toISOString(), people_count: 40, noise_level: 0.1, noise_unit: 'relative',
} };
const report = (id, values = {}, age = 1000) => ({ reporter_hash: String(id), network_hash: String(id), created_at: new Date(now - age).toISOString(),
  people_count: null, occupancy_percent: null, noise_band: null, ...values });

test('reasonable observations gently supplement a fresh sensor without mutating it', () => {
  const before = structuredClone(room);
  const estimate = communityEstimate(room, [report(1, { people_count: 50 })], 60, now);
  assert.equal(estimate.occupancy.source, 'sensor + community');
  assert.equal(estimate.occupancy.people_count, 42);
  assert.deepEqual(room, before);
  assert.ok(Date.parse(estimate.occupancy.expires_at) <= Date.parse(room.latest_reading.measured_at) + 60000);
  assert.equal(communityEstimate(room, [report(1, { people_count: 100 })], 60, now).occupancy, null);
  const smallRoom = { ...room, total_capacity: 60, latest_reading: { ...room.latest_reading, people_count: 10 } };
  assert.equal(communityEstimate(smallRoom, [report(1, { people_count: 12 }), report(2, { people_count: 100 })], 60, now).occupancy.report_count, 1);
});

test('one sensorless report contributes immediately; later outliers are excluded', () => {
  const empty = { ...room, latest_reading: null };
  const reports = [report(1, { people_count: 20 }), report(2, { people_count: 21 }), report(3, { people_count: 22 }), report(4, { people_count: 200 })];
  const single = communityEstimate(empty, reports.slice(0, 1), 60, now).occupancy;
  assert.equal(single.people_count, 20);
  assert.equal(single.report_count, 1);
  const result = communityEstimate(empty, reports, 60, now);
  assert.equal(result.occupancy.people_count, 21);
  assert.equal(result.occupancy.report_count, 3);
  assert.equal(result.occupancy.source, 'community');
  const repeated = communityEstimate(empty, [report(1, { people_count: 20 }, 3000), report(1, { people_count: 21 }, 2000), report(1, { people_count: 22 })], 60, now).occupancy;
  assert.equal(repeated.people_count, 22);
  assert.equal(repeated.report_count, 1);
});

test('percentage reports convert only with known capacity and metrics remain independent', () => {
  const observations = [report(1, { occupancy_percent: 75, noise_band: 'moderate' })];
  const empty = { ...room, latest_reading: null };
  assert.equal(communityEstimate(empty, observations, 60, now).occupancy.people_count, 75);
  const result = communityEstimate({ ...empty, total_capacity: null }, observations, 60, now);
  assert.equal(result.occupancy.people_count, null);
  assert.ok(Math.abs(result.occupancy.fraction - 0.75) < 1e-10);
  assert.equal(result.noise.noise_band, 'moderate');
  assert.equal(result.noise.noise_unit, 'qualitative');
  assert.equal(result.noise.noise_level, undefined);
  assert.equal(communityEstimate(empty, [1, 2, 3].map(id => report(id, { noise_band: 'quiet' })), 60, now).occupancy, null);
});

test('one network can contribute and categorical ties do not invent a noise consensus', () => {
  const empty = { ...room, latest_reading: null };
  const observations = [report(1, { people_count: 50, noise_band: 'quiet', network_hash: 'same-network' })];
  assert.equal(communityEstimate(empty, observations, 60, now).occupancy.people_count, 50);
  assert.equal(communityEstimate(empty, observations, 60, now).noise.noise_band, 'quiet');
  const shared = [...observations, report(2, { people_count: 52, noise_band: 'quiet', network_hash: 'same-network' })];
  assert.equal(communityEstimate(empty, shared, 60, now).occupancy.report_count, 2);
  assert.equal(communityEstimate(empty, [report(1, { noise_band: 'quiet' }), report(2, { noise_band: 'moderate' }), report(3, { noise_band: 'lively' })], 60, now).noise, null);
  const legitimate = [1, 2, 3].map(id => report(id, { people_count: 20, noise_band: 'quiet' }));
  const outlier = report('outlier', { people_count: 100, noise_band: 'lively' });
  const result = communityEstimate(empty, [...legitimate, outlier], 60, now);
  assert.equal(result.occupancy.people_count, 20);
  assert.equal(result.noise.noise_band, 'quiet');
});

test('expired, future, repeated and demo readings cannot create extra trusted votes', () => {
  const expired = [1, 2, 3].map(id => report(id, { people_count: 50 }, REPORT_WINDOW_MS));
  assert.equal(communityEstimate(room, expired, 60, now).reports.recent, 0);
  assert.equal(communityEstimate(room, [report(1, { people_count: 50 }, -1)], 60, now).occupancy, null);
  const demo = communityEstimate({ ...room, latest_reading: { ...room.latest_reading, device_id: 'demo-abc' } }, [report(1, { people_count: 50 })], 60, now).occupancy;
  assert.equal(demo.people_count, 50);
  assert.equal(demo.source, 'community');
  const samePerson = [report(1, { people_count: 45 }, 10000), report(1, { people_count: 48 }, 5000), report(1, { noise_band: 'quiet' })];
  const result = communityEstimate(room, samePerson, 60, now);
  assert.equal(result.occupancy.report_count, 1);
  assert.equal(result.noise.report_count, 1);
});

test('public presentation hides identities and client expires occupancy and noise independently', () => {
  const observations = [report(1, { people_count: 20, noise_band: 'moderate' })];
  const presented = presentRoom({ ...room, latest_reading: null, community_reports: observations }, 60, now);
  assert.equal(JSON.stringify(presented).includes('reporter_hash'), false);
  assert.equal(freshness(presented, now, 60), 'live');
  assert.equal(availableSeats(presented, now, 60), 80);
  assert.equal(noiseBand(noiseReading(presented, now, 60)).label, 'Moderate');
  assert.equal(occupancyReading(presented, now).people_count, 20);
  assert.equal(freshness(presented, now + REPORT_WINDOW_MS, 60), 'waiting');
  assert.equal(noiseReading(presented, now + REPORT_WINDOW_MS, 60), null);
});

test('report validation rejects empty, conflicting, impossible or client-weighted values', () => {
  for (const extra of [{}, { people_count: -1 }, { people_count: 1.5 }, { people_count: '1' }, { people_count: 10001 },
    { occupancy_percent: 101 }, { occupancy_percent: -1 }, { occupancy_percent: '50' }, { occupancy_percent: NaN },
    { people_count: 1, occupancy_percent: 1 }, { noise_band: 'deafening' }, { people_count: 3, weight: 100 },
    { people_count: 3, created_at: new Date(now).toISOString() }]) {
    assert.throws(() => validateReport({ room_id: 'room', ...extra }));
  }
  assert.equal(validateReport({ room_id: 'room', people_count: 0 }).people_count, 0);
  assert.equal(validateReport({ room_id: 'room', occupancy_percent: 0, noise_band: 'quiet' }).occupancy_percent, 0);
});
