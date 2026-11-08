import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readConfig } from '../server/config.js';
import { createPool } from '../server/database.js';
import { createStore, presentRoom } from '../server/store.js';
import { serve } from './helpers.js';

const hash = value => createHash('sha256').update(value).digest('hex');

test('real database reports persist, aggregate, validate capacity and enforce per-room/browser/network limits', async () => {
  const pool = createPool(readConfig());
  const db = await pool.connect();
  await db.query('BEGIN');
  try {
    const roomId = `test-${randomUUID()}`;
    await db.query('INSERT INTO study_room.rooms(room_id,name,total_capacity) VALUES ($1,$2,100)', [roomId, 'Reporting integration']);
    const store = createStore(db);
    const body = { room_id: roomId, people_count: 20, occupancy_percent: null, noise_band: 'quiet' };
    const identity = id => ({ reporter_hash: hash(`${roomId}-person-${id}`), network_hash: hash(`${roomId}-network-${id}`) });
    await assert.rejects(store.report({ ...body, room_id: 'missing-room' }, identity(1)), error => error.status === 404);
    await assert.rejects(store.report({ ...body, people_count: 1000 }, identity(1)), error => error.status === 400);
    await store.report(body, identity(1));
    const single = presentRoom((await store.rooms(roomId))[0], 60);
    assert.equal(single.estimate.occupancy.people_count, 20);
    assert.equal(single.estimate.occupancy.report_count, 1);
    assert.equal(single.estimate.noise.noise_band, 'quiet');
    await assert.rejects(store.report(body, identity(1)), error => error.status === 429);
    for (const id of [2, 3]) await store.report({ ...body, people_count: 20 + id }, identity(id));
    await store.report({ ...body, people_count: 200 }, identity(4));
    const row = (await store.rooms(roomId))[0];
    const result = presentRoom(row, 60);
    assert.equal(result.latest_reading, null);
    assert.equal(result.estimate.occupancy.report_count, 3);
    assert.equal(result.estimate.occupancy.people_count, 22);
    assert.equal(result.estimate.noise.noise_band, 'quiet');
    assert.equal(JSON.stringify(result).includes('reporter_hash'), false);
    assert.equal(JSON.stringify(result).includes('network_hash'), false);
    // Exercise network-wide flood protection with fresh browser identities.
    const network = identity('flood').network_hash;
    await db.query(`INSERT INTO study_room.reports(room_id, reporter_hash, network_hash, noise_band)
      SELECT $1, md5(i::text) || md5(i::text), $2, 'quiet' FROM generate_series(1,40) i`, [roomId, network]);
    await assert.rejects(store.report(body, { ...identity(99), network_hash: network }), error => error.status === 429);
    const reporter = identity('global').reporter_hash;
    await db.query(`INSERT INTO study_room.reports(room_id, reporter_hash, network_hash, created_at, noise_band)
      SELECT $1, $2, $3, clock_timestamp() - interval '6 minutes', 'quiet' FROM generate_series(1,6)`, [roomId, reporter, identity('global').network_hash]);
    await assert.rejects(store.report(body, { ...identity('global'), reporter_hash: reporter }), error => error.status === 429);
  } finally {
    await db.query('ROLLBACK'); db.release(); await pool.end();
  }
});

test('simultaneous HTTP reports sharing one signed cookie cannot race the persisted cooldown', async () => {
  const pool = createPool(readConfig());
  const roomId = `test-${randomUUID()}`;
  const secret = 'integration-report-secret-'.repeat(3);
  const id = 'a'.repeat(48);
  const signature = createHmac('sha256', secret).update(`cookie:${id}`).digest('hex');
  let app;
  try {
    await pool.query('INSERT INTO study_room.rooms(room_id,name) VALUES ($1,$2)', [roomId, 'Concurrent report test']);
    app = await serve(createStore(pool), { config: { reportSecret: secret } });
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `room_reporter=${id}.${signature}` },
      body: JSON.stringify({ room_id: roomId, noise_band: 'quiet' }) };
    const results = await Promise.all([app.request('/api/reports', options), app.request('/api/reports', options)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 429]);
    assert.equal(Number((await pool.query('SELECT count(*) FROM study_room.reports WHERE room_id=$1', [roomId])).rows[0].count), 1);
  } finally {
    if (app) await app.close();
    await pool.query('DELETE FROM study_room.reports WHERE room_id=$1', [roomId]);
    await pool.query('DELETE FROM study_room.rooms WHERE room_id=$1', [roomId]);
    await pool.end();
  }
});
