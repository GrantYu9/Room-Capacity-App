import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { serve, reading, post, token } from './helpers.js';
import { validateMetadata, timestamp } from '../server/validation.js';
import { presentRoom } from '../server/store.js';
import { readConfig } from '../server/config.js';

test('TLS mode follows the explicit URL and preserves certificate-verifying mode', () => {
  const requireUrl = new URL(readConfig({ DATABASE_URL: 'postgresql://example.invalid/db?sslmode=require' }).databaseUrl);
  assert.equal(requireUrl.searchParams.get('uselibpqcompat'), 'true');
  const verifyUrl = new URL(readConfig({ DATABASE_URL: 'postgresql://example.invalid/db?sslmode=verify-full' }).databaseUrl);
  assert.equal(verifyUrl.searchParams.get('sslmode'), 'verify-full');
  assert.equal(verifyUrl.searchParams.has('uselibpqcompat'), false);
});

test('uploads require a valid room-bound token and validated measurements', async t => {
  let writes = 0;
  const app = await serve({
    findDevice: async hash => hash === createHash('sha256').update(token).digest('hex') ? { device_id: 'pi-1', room_id: 'room-1' } : null,
    record: async (_device, value) => { writes++; return value; },
  });
  t.after(() => app.close());
  assert.equal((await app.request('/api/readings', post(reading(), 'b'.repeat(64)))).status, 401);
  assert.equal((await app.request('/api/readings', post(reading({ room_id: 'room-2' })))).status, 403);
  for (const change of [
    { people_count: -1 }, { people_count: 1.5 }, { people_count: '4' },
    { noise_level: 1.1 }, { noise_level: '0.2' }, { noise_unit: 'dB' },
    { noise_unit: 'dBA', noise_level: 161 }, { total_capacity: 20 },
    { measured_at: '2026-11-07T12:00:00' }, { measured_at: '2026-02-30T12:00:00Z' },
    { measured_at: new Date(Date.now() + 120000).toISOString() },
  ]) assert.equal((await app.request('/api/readings', post(reading(change)))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await app.request('/api/readings', post(reading()))).status, 200);
  assert.equal((await app.request('/api/readings', post(reading({ noise_unit: 'dBA', noise_level: 55 })))).status, 200);
  assert.equal(writes, 2);
});

test('malformed/oversized bodies and unwanted browser origins are rejected', async t => {
  let writes = 0;
  const app = await serve({ findDevice: async () => ({ room_id: 'room-1' }), record: async () => { writes++; } });
  t.after(() => app.close());
  const malformed = post(reading());
  malformed.body = '{';
  assert.equal((await app.request('/api/readings', malformed)).status, 400);
  const oversized = post(reading());
  oversized.body = JSON.stringify({ payload: 'x'.repeat(4096) });
  assert.equal((await app.request('/api/readings', oversized)).status, 413);
  const wrongType = post(reading());
  wrongType.headers['Content-Type'] = 'text/plain';
  assert.equal((await app.request('/api/readings', wrongType)).status, 415);
  const badOrigin = post(reading());
  badOrigin.headers.Origin = 'https://unlisted.example';
  assert.equal((await app.request('/api/readings', badOrigin)).status, 403);
  const preflight = await app.request('/api/readings', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(writes, 0);
});

test('database errors do not leak internal details', async t => {
  const app = await serve({ health: async () => { throw new Error('private-password private-host'); } });
  t.after(() => app.close());
  const result = await app.request('/api/health');
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: 'Database temporarily unavailable.' });
});

test('metadata stays unknown until supplied and source validation does not fetch URLs', () => {
  const room = validateMetadata({ room_id: 'room-1', name: 'Room' });
  assert.equal(room.total_capacity, null);
  assert.equal(room.source_checked_at, null);
  for (const source_url of [['https://ubc.ca'], 'https://ubc.ca.evil.example', 'http://ubc.ca', 'https://user:password@ubc.ca']) {
    assert.throws(() => validateMetadata({ room_id: 'room-1', name: 'Room', source_url }));
  }
  assert.throws(() => validateMetadata({ room_id: 'room-1', name: 'Room', latitude: 49 }));
  assert.throws(() => validateMetadata({ room_id: 'room-1', name: 'Room', total_capacity: 0 }));
  assert.throws(() => validateMetadata({ room_id: 'room-1', name: 'Room', capacity: 5 }));
  assert.throws(() => timestamp('2026-11-07T24:00:00Z'));
  const now = Date.now();
  const live = { ...room, latest_reading: { measured_at: new Date(now).toISOString(), people_count: 4 } };
  assert.equal(presentRoom(live, 60, now).occupancy_fraction, null);
  assert.equal(presentRoom({ ...live, total_capacity: 3 }, 60, now).occupancy_fraction, 4 / 3);
  assert.equal(presentRoom({ ...live, total_capacity: 3 }, 60, now + 61000).occupancy_fraction, null);
  assert.equal(presentRoom({ ...room, latest_reading: null }, 60, now).stale, true);
});

test('read routes validate room IDs, limits and history cursors', async t => {
  const app = await serve({ rooms: async () => [], history: async () => null });
  t.after(() => app.close());
  assert.equal((await app.request('/api/rooms')).status, 200);
  assert.equal((await app.request('/api/rooms?room_id=missing')).status, 404);
  for (const path of ['/api/readings', '/api/readings?room_id=room-1&limit=1001', '/api/readings?room_id=room-1&limit=1.5', '/api/readings?room_id=room-1&cursor=garbage']) {
    assert.equal((await app.request(path)).status, 400);
  }
  assert.equal((await app.request('/api/readings?room_id=missing')).status, 404);
  assert.equal((await app.request('/api/rooms', { method: 'DELETE' })).status, 405);
  assert.equal((await app.request('/missing')).status, 404);
});
