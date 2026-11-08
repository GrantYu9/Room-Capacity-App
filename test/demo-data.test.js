import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoPayload } from '../scripts/demo-data.js';

test('demo covers every scraped space and building with bounded, timestamped history', () => {
  const rooms = JSON.parse(readFileSync(new URL('../data/rooms.json', import.meta.url)));
  const now = Date.now();
  const payload = demoPayload(rooms, now);
  assert.equal(payload.length, 68);
  assert.equal(new Set(payload.map(r => r.building)).size, 38);
  assert.equal(new Set(payload.map(r => r.device_id)).size, 68);
  for (const [i, room] of payload.entries()) {
    assert.equal(room.total_capacity, rooms[i].total_capacity);
    assert.equal(room.source_url, rooms[i].source_url);
    assert.match(room.device_id, /^demo-[a-f0-9]{24}$/);
    assert.equal(room.readings.length, 73);
    for (const reading of room.readings) {
      assert.ok(Number.isInteger(reading.people_count) && reading.people_count >= 0);
      assert.ok(reading.people_count <= (room.total_capacity ?? 20));
      assert.ok(reading.noise_level >= 0 && reading.noise_level <= 1);
      assert.equal(reading.noise_unit, 'relative');
      assert.ok(Date.parse(reading.measured_at) <= now);
    }
    assert.ok(now - Date.parse(room.readings.at(-1).measured_at) < 20000);
  }
  assert.equal(demoPayload(rooms, now, false)[0].readings.length, 1);
});
