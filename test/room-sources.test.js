import test from 'node:test';
import assert from 'node:assert/strict';
import { splitRoomSources } from '../src/roomSources.js';

const listing = { room_id: 'ubc-room', source_url: 'https://learningspaces.ubc.ca/classrooms/room' };

test('the public catalog is available without an API and never becomes a reading', () => {
  assert.deepEqual(splitRoomSources([listing], []), { monitored: [], unmonitored: [listing] });
});

test('imported catalog entries without readings stay in the unmonitored directory', () => {
  const pending = { ...listing, latest_reading: null };
  const prototype = { room_id: 'prototype', latest_reading: null };
  assert.deepEqual(splitRoomSources([listing], [pending, prototype]), {
    monitored: [prototype], unmonitored: [listing],
  });
});

test('a reading moves a listing to the monitored list by ID or canonical source URL', () => {
  for (const apiRoom of [
    { ...listing, source_url: null },
    { ...listing, room_id: 'existing-id', source_url: `${listing.source_url}/` },
  ]) {
    const room = { ...apiRoom, latest_reading: { measured_at: '2020-01-01T00:00:00Z' } };
    assert.deepEqual(splitRoomSources([listing], [room]), { monitored: [room], unmonitored: [] });
  }
});

test('similar names do not merge distinct spaces', () => {
  const room = { room_id: 'different-room', name: 'Same name', latest_reading: {} };
  assert.deepEqual(splitRoomSources([{ ...listing, name: room.name }], [room]).unmonitored.length, 1);
});

test('listing photos are local files with UBC provenance and explicit missing coverage', async () => {
  const { readFile } = await import('node:fs/promises');
  const catalog = JSON.parse(await readFile(new URL('../data/rooms.json', import.meta.url), 'utf8'));
  const photos = JSON.parse(await readFile(new URL('../data/room-images.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(photos.images).length + photos.missing.length, catalog.length);
  for (const room of catalog) {
    const photo = photos.images[room.room_id];
    if (!photo) {
      assert.ok(photos.missing.some(entry => entry.room_id === room.room_id && entry.reason));
      continue;
    }
    assert.equal(photo.source_url, room.source_url);
    assert.match(photo.path, /^\/images\/study-spaces\/[a-z0-9-]+\.(jpg|png|webp)$/);
    const bytes = await readFile(new URL(`../public${photo.path}`, import.meta.url));
    assert.ok(bytes.length > 1000);
    assert.ok(photo.downloaded_at);
  }
});
