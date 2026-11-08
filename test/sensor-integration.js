// Cross-repo development check: real YOLO + generated audio -> Python outbox ->
// HTTP authentication -> real PostgreSQL -> latest/history -> frontend band.
// All database rows are isolated inside a transaction and rolled back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../server/config.js';
import { createPool } from '../server/database.js';
import { createStore } from '../server/store.js';
import { noiseBand } from '../src/rooms.js';
import { serve, post, reading } from './helpers.js';

test('sensor inference uploads integer counts, qualitative noise and box confidence into real SQL', async () => {
  const sensorRoot = fileURLToPath(new URL('../../Room-Capacity-Sensor/', import.meta.url));
  const pool = createPool(readConfig());
  let db;
  let app;
  try {
    db = await pool.connect();
    await db.query('BEGIN');
    const room = `test-${randomUUID()}`;
    const device = `test-${randomUUID()}`;
    const token = randomBytes(32).toString('hex');
    await db.query('INSERT INTO study_room.rooms (room_id, name) VALUES ($1, $2)', [room, 'Temporary sensor integration']);
    await db.query('INSERT INTO study_room.devices (device_id, room_id, token_hash) VALUES ($1, $2, $3)',
      [device, room, createHash('sha256').update(token).digest('hex')]);
    app = await serve(createStore(db));
    const program = `
import json, os, tempfile
from datetime import datetime, timezone
from pathlib import Path
from src.process_data import ImageProcessor
from src.upload import DeviceConfig, ReadingUploader, reading_payload
root = Path.cwd()
processor = ImageProcessor()
image = root / 'data/testing/synthetic-2026-11-07/images/single.png'
with tempfile.TemporaryDirectory() as directory:
    uploader = ReadingUploader(DeviceConfig.load('/dev/null'), Path(directory) / 'outbox.sqlite3')
    try:
        counts = []
        for i, band in enumerate(['quiet', 'moderate', 'lively']):
            result = processor.process_data(root / f'data/testing/noise-synthetic-v1/check-{band}-1.wav', [image])
            payload = reading_payload(result, uploader.config.room_id, datetime.now(timezone.utc).isoformat(timespec='milliseconds'))
            uploader.enqueue(payload)
            uploader.flush()
            counts.append({'band': result['noise_band'], 'count': result['count'], 'confidence': result['average_confidence']})
        print(json.dumps(counts))
    finally:
        uploader.close()
`;
    const { stdout } = await promisify(execFile)(sensorRoot + '.venv/bin/python', ['-c', program], {
      cwd: sensorRoot,
      env: { ...process.env, API_URL: app.base, ROOM_ID: room, DEVICE_ID: device, DEVICE_TOKEN: token },
      timeout: 45000,
    });
    const results = JSON.parse(stdout.trim());
    assert.deepEqual(results.map(r => r.count), [1, 1, 1]);
    assert.deepEqual(results.map(r => r.band), ['quiet', 'moderate', 'lively']);
    assert.ok(results.every(r => r.confidence > 0 && r.confidence <= 1));
    const history = (await app.request('/api/readings?room_id=' + room)).body.readings;
    assert.equal(history.length, 3);
    assert.deepEqual(history.map(r => noiseBand(r).level), ['quiet', 'moderate', 'lively']);
    assert.ok(history.every(r => r.people_count === 1 && r.device_id === device && r.average_confidence > 0));
    const latest = (await app.request('/api/rooms?room_id=' + room)).body.rooms[0].latest_reading;
    assert.equal(latest.average_confidence, results[2].confidence);
    assert.equal(noiseBand(latest).level, 'lively');
    assert.equal((await app.request('/api/readings', post(reading({ room_id: room + '-wrong' }), token))).status, 403);
    // A direct database write is also constrained, independently of API checks.
    await db.query('SAVEPOINT invalid_confidence');
    await assert.rejects(db.query(`INSERT INTO study_room.readings
      (device_id, room_id, measured_at, people_count, noise_level, noise_unit, average_confidence)
      VALUES ($1,$2,now() - interval '1 day',0,0,'relative',1.1)`, [device, room]), { code: '23514' });
    await db.query('ROLLBACK TO SAVEPOINT invalid_confidence');
    console.log('Verified actual sensor -> authenticated HTTP -> SQL -> frontend bands; temporary rows rolled back.');
  } finally {
    if (app) await app.close();
    if (db) { await db.query('ROLLBACK'); db.release(); }
    await pool.end();
  }
});
