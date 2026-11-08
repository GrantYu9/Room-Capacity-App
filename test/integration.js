import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readConfig } from '../server/config.js';
import { createPool } from '../server/database.js';
import { createStore, upsertRoom } from '../server/store.js';
import { validateMetadata } from '../server/validation.js';
import { serve, reading, post, token } from './helpers.js';

test('real Tiger Data: room-bound upload, idempotency, metadata, latest and paged history', async () => {
  const pool = createPool(readConfig());
  let db;
  let app;
  try {
    db = await pool.connect();
    await db.query('BEGIN');
    const roomId = `test-${randomUUID()}`;
    const deviceId = `test-${randomUUID()}`;
    const otherDevice = `test-${randomUUID()}`;
    await db.query('INSERT INTO study_room.rooms (room_id, name) VALUES ($1, $2)', [roomId, 'Temporary integration test']);
    await db.query('INSERT INTO study_room.devices (device_id, room_id, token_hash) VALUES ($1, $2, $3)',
      [deviceId, roomId, createHash('sha256').update(token).digest('hex')]);
    await db.query('INSERT INTO study_room.devices (device_id, room_id, token_hash) VALUES ($1, $2, $3)',
      [otherDevice, roomId, createHash('sha256').update(randomUUID()).digest('hex')]);
    app = await serve(createStore(db));
    assert.equal((await app.request('/api/health')).status, 200);
    const roomPath = '/api/rooms?room_id=' + roomId;
    let room = (await app.request(roomPath)).body.rooms[0];
    assert.equal(room.total_capacity, null);
    assert.equal(room.latest_reading, null);
    assert.equal(room.stale, true);
    const currentTime = Date.now();
    const measured = new Date(currentTime - 1000).toISOString();
    const value = reading({ room_id: roomId, measured_at: measured, average_confidence: 0.72 });
    const first = await app.request('/api/readings', post(value));
    assert.equal(first.status, 200);
    assert.equal(first.body.reading.average_confidence, 0.72);
    const retry = await app.request('/api/readings', post(value));
    assert.equal(retry.status, 200);
    assert.equal(retry.body.reading.received_at, first.body.reading.received_at);
    assert.equal((await app.request('/api/readings', post({ ...value, people_count: 5 }))).status, 409);
    assert.equal((await app.request('/api/readings', post({ ...value, average_confidence: 0.9 }))).status, 409);
    assert.equal((await app.request('/api/readings', post({ ...value, room_id: 'another-room' }))).status, 403);
    for (const seconds of [3, 2]) {
      assert.equal((await app.request('/api/readings', post({ ...value,
        measured_at: new Date(currentTime - seconds * 1000).toISOString(), noise_level: 52, noise_unit: 'dBA' }))).status, 200);
    }
    // Exercise the same-time tie across devices: the cursor must not skip either.
    await createStore(db).record({ device_id: otherDevice, room_id: roomId }, value);
    room = (await app.request(roomPath)).body.rooms[0];
    assert.equal(Date.parse(room.latest_reading.measured_at), Date.parse(measured));
    assert.equal(room.latest_reading.noise_unit, 'relative');
    assert.equal(room.latest_reading.average_confidence, 0.72);
    assert.equal(room.occupancy_fraction, null);
    await upsertRoom(db, validateMetadata({ room_id: roomId, name: 'Temporary integration test', total_capacity: 8 }));
    room = (await app.request(roomPath)).body.rooms[0];
    assert.equal(room.occupancy_fraction, 0.5);
    assert.equal(room.location.building, null);
    const seen = [];
    let cursor = null;
    do {
      const path = `/api/readings?room_id=${roomId}&limit=1` + (cursor ? '&cursor=' + cursor : '');
      const page = await app.request(path);
      assert.equal(page.status, 200);
      assert.ok(page.body.readings.every(r => r.average_confidence === 0.72));
      seen.push(...page.body.readings.map(r => `${r.measured_at}:${r.device_id}`));
      cursor = page.body.next_cursor;
      assert.equal(page.body.has_more, Boolean(cursor));
    } while (cursor && seen.length < 10);
    assert.equal(seen.length, 4);
    assert.equal(new Set(seen).size, 4);
    const count = await db.query('SELECT count(*)::integer AS count FROM study_room.readings WHERE room_id = $1', [roomId]);
    assert.equal(count.rows[0].count, 4);
    const uploaded = await promisify(execFile)('python3', [
      'examples/send_reading.py', '--env', '/dev/null', '--people', '6', '--noise', '0.2', '--noise-unit', 'relative',
    ], { env: { ...process.env, API_URL: app.base, ROOM_ID: roomId, DEVICE_TOKEN: token }, timeout: 15000 });
    assert.equal(JSON.parse(uploaded.stdout).reading.people_count, 6);
    assert.equal(JSON.parse(uploaded.stdout).reading.average_confidence, null);
    await db.query('UPDATE study_room.devices SET active = false WHERE device_id = $1', [deviceId]);
    assert.equal((await app.request('/api/readings', post(value))).status, 401);
    console.log('Verified real HTTP + SQL; temporary room, devices and readings will be rolled back.');
  } finally {
    if (app) await app.close();
    if (db) { await db.query('ROLLBACK'); db.release(); }
    await pool.end();
  }
});
