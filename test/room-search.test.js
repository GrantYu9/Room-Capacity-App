import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchesRoomSearch, normalizeSearch } from '../src/roomSearch.js';

const catalog = JSON.parse(await readFile(new URL('../data/rooms.json', import.meta.url), 'utf8'));
const aliases = JSON.parse(await readFile(new URL('../data/building-aliases.json', import.meta.url), 'utf8'));
const find = query => catalog.filter(room => matchesRoomSearch(room, query)).map(room => room.room_id);
const angus = catalog.filter(room => room.building === 'Henry Angus Building').map(room => room.room_id);

test('Sauder aliases and small spelling errors find the ANGU spaces', () => {
  for (const query of ['sauder', 'SAUDER', 'saudre', 'sader', 'sauderr', 'Sauder School of Business', 'commerce', 'ANGU']) {
    assert.deepEqual(find(query), angus, query);
  }
});

test('generic area searches include every matching space across buildings', () => {
  const atriums = catalog.filter(room => /atrium/i.test(room.name)).map(room => room.room_id);
  assert.equal(atriums.length, 7);
  assert.deepEqual(find('atrium'), atriums);
  assert.deepEqual(find('atrim'), atriums);
  assert.deepEqual(find('atrium LSC'), catalog.filter(room => /LSC.*Atrium/.test(room.name)).map(room => room.room_id));
});

test('search ignores accents, punctuation and word order, and accepts partial words', () => {
  assert.equal(normalizeSearch('  CAFÉ / School-of-Business '), 'cafe school of business');
  assert.deepEqual(find('cafe'), find('café'));
  assert.deepEqual(find('business sauder'), angus);
  assert.deepEqual(find('saud'), angus);
  assert.ok(find('B. Birmingham').includes('ubc-angu-bruce-r-birmingham-undergraduate-centre'));
});

test('the same aliases work with nested API metadata and stable IDs', () => {
  const room = catalog.find(room => room.room_id === angus[0]);
  assert.ok(matchesRoomSearch({ name: 'Study lounge', location: { building: room.building } }, 'sauder'));
  assert.ok(matchesRoomSearch({ room_id: room.room_id, name: 'Study lounge', location: {} }, 'sauder'));
  assert.ok(matchesRoomSearch({ name: room.name, location: {} }, 'sauder'));
});

test('fuzzy search does not approximate room numbers or match unrelated queries', () => {
  const room = { name: 'Study Room', location: { room_number: '2108', building: 'Test Hall' } };
  assert.ok(matchesRoomSearch(room, '2108'));
  assert.equal(matchesRoomSearch(room, '2109'), false);
  assert.equal(matchesRoomSearch(room, '210'), false);
  assert.deepEqual(find('sauder atrium'), []);
  assert.deepEqual(find('zzzzzzzzzzzzzz'), []);
  assert.equal(matchesRoomSearch({}, 'sauder'), false);
  assert.ok(matchesRoomSearch({}, '   '));
});

test('curated aliases have unique codes and reference existing directory buildings', () => {
  assert.equal(new Set(aliases.map(entry => entry.code)).size, aliases.length);
  for (const entry of aliases) {
    assert.ok(catalog.some(room => room.building === entry.building));
    assert.ok(entry.aliases.length > 0 && entry.aliases.every(alias => typeof alias === 'string' && alias.trim()));
  }
});
