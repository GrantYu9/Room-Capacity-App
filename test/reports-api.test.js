import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './helpers.js';
import { ApiError } from '../server/validation.js';
import { networkKey } from '../server/report-identity.js';

const options = { config: { reportSecret: 'test-secret-'.repeat(5) } };
const request = (body, cookie, extra = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: JSON.stringify(body) });

test('IPv6 privacy addresses share a rate-limit bucket and mapped IPv4 is canonical', () => {
  assert.equal(networkKey('2001:db8:abcd:1234:1:2:3:4'), networkKey('2001:db8:abcd:1234:abcd::1'));
  assert.equal(networkKey('2001:db8::1'), networkKey('2001:0db8:0000:0000:0:0:0:2'));
  assert.equal(networkKey('::ffff:127.0.0.1'), networkKey('127.0.0.1'));
  assert.throws(() => networkKey('forged-value'));
});

test('anonymous reports get a signed identity; forged forwarded headers cannot evade network limits', async t => {
  const identities = [];
  const app = await serve({ report: async (_report, identity) => identities.push(identity) }, options);
  t.after(() => app.close());
  const result = await app.request('/api/reports', request({ room_id: 'room', people_count: 0 }));
  assert.equal(result.status, 201);
  const cookie = result.headers.get('set-cookie').split(';')[0];
  assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await app.request('/api/reports', request({ room_id: 'room', noise_band: 'quiet' }, cookie, { 'X-Forwarded-For': 'evil', 'x-vercel-forwarded-for': 'evil' }))).status, 201);
  assert.deepEqual(identities[0], identities[1]);
  assert.equal(JSON.stringify(result.body).includes(identities[0].reporter_hash), false);
  await app.request('/api/reports', request({ room_id: 'room', people_count: 1 }, cookie.replace(/.$/, cookie.endsWith('a') ? 'b' : 'a')));
  assert.notEqual(identities[0].reporter_hash, identities[2].reporter_hash);
  assert.equal(identities[0].network_hash, identities[2].network_hash);
});

test('reports enforce JSON validation, browser origins, missing configuration and rate-limit feedback', async t => {
  let writes = 0;
  const app = await serve({ report: async () => { writes++; throw new ApiError(429, 'Please wait.'); } }, options);
  t.after(() => app.close());
  assert.equal((await app.request('/api/reports', request({ room_id: 'room' }))).status, 400);
  assert.equal((await app.request('/api/reports', request({ room_id: 'room', people_count: 1 }, null, { Origin: 'https://evil.example' }))).status, 403);
  const limited = await app.request('/api/reports', request({ room_id: 'room', people_count: 1 }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '300');
  assert.equal(writes, 1);
  assert.equal((await app.request('/api/reports')).status, 405);
  const disabled = await serve({ report: async () => { throw new Error('must not write'); } });
  t.after(() => disabled.close());
  assert.equal((await disabled.request('/api/reports', request({ room_id: 'room', people_count: 1 }))).status, 503);
});
