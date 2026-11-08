import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMetadata } from '../server/validation.js';
import { presentRoom } from '../server/store.js';
import { availableSeats, roomState } from '../src/rooms.js';

const rooms = JSON.parse(await readFile(new URL('../data/rooms.json', import.meta.url), 'utf8'));
const collection = JSON.parse(await readFile(new URL('../data/rooms.collection.json', import.meta.url), 'utf8'));

test('collected UBC rooms satisfy the importer metadata rules and have unique identities', () => {
  assert.ok(Array.isArray(rooms) && rooms.length > 0 && rooms.length <= 10000);
  assert.equal(new Set(rooms.map(room => room.room_id)).size, rooms.length);
  assert.equal(new Set(rooms.map(room => room.source_url)).size, rooms.length);
  for (const room of rooms) {
    assert.deepEqual(validateMetadata(room), room);
    assert.equal(new URL(room.source_url).hostname, 'learningspaces.ubc.ca');
    assert.match(new URL(room.source_url).pathname, /^\/classrooms\/[^/]+\/?$/);
    assert.ok(room.source_checked_at);
    assert.ok(room.building && room.room_number && room.address);
  }
});

test('collection audit accounts for every paginated entry and verified source', () => {
  const { coverage, records, buildings } = collection;
  assert.equal(coverage.status, 'complete');
  assert.equal(coverage.directory_records, rooms.length);
  assert.equal(coverage.verified_detail_pages, rooms.length);
  assert.equal(coverage.pages.reduce((count, page) => count + page.count, 0), rooms.length);
  assert.deepEqual(coverage.pages.map(page => page.page), coverage.pages.map((_, index) => index + 1));
  assert.ok(coverage.pages.slice(0, -1).every(page => page.has_next));
  assert.equal(coverage.pages.at(-1).has_next, false);
  assert.deepEqual(coverage.unretrieved_entries, []);
  assert.equal(records.length, rooms.length);
  assert.equal(new Set(records.map(record => record.directory_record_id)).size, rooms.length);
  assert.equal(buildings.length, coverage.building_pages);
  for (const room of rooms) {
    const evidence = records.find(record => record.room_id === room.room_id);
    assert.ok(evidence);
    assert.equal(evidence.source_url, room.source_url);
    assert.equal(evidence.detail_checked_at, room.source_checked_at);
    const building = buildings.find(source => source.source_url === evidence.building_source_url);
    assert.ok(building?.checked_at);
    assert.equal(building.address, room.address);
    assert.equal(evidence.directory_capacity, evidence.detail_capacity);
    if (evidence.flags.some(flag => flag.kind === 'conflicting_capacity')) {
      assert.equal(room.total_capacity, null);
    } else {
      assert.equal(room.total_capacity, evidence.detail_capacity);
    }
  }
});

test('capacity conflicts and grouped spaces remain explicit without invented seats', () => {
  const foyer = rooms.find(room => room.room_id === 'ubc-henn-foyer');
  assert.equal(foyer.total_capacity, null);
  const flag = collection.records.find(record => record.room_id === foyer.room_id).flags[0];
  assert.equal(flag.published_capacity, 42);
  assert.equal(flag.overview_seats, 34);
  const grouped = rooms.filter(room => room.source_url.endsWith('/pcw-rooms-2108-2109-2111'));
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].total_capacity, 12);
  assert.deepEqual(collection.identity.ambiguous_matches, []);
  assert.ok(!rooms.some(room => room.room_id === 'room-1'));
});

test('directory metadata alone leaves every space awaiting its first reading', () => {
  const now = Date.now();
  for (const metadata of rooms) {
    const room = presentRoom({ ...metadata, latest_reading: null }, 60, now);
    assert.equal(room.latest_reading, null);
    assert.equal(room.stale, true);
    assert.equal(room.occupancy_fraction, null);
    assert.equal(roomState(room, now, 60).label, 'Awaiting a reading');
    assert.equal(availableSeats(room, now, 60), null);
  }
});
