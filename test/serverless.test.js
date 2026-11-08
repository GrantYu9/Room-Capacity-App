import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readConfig } from '../server/config.js';
import { createServerlessHandler } from '../server/serverless.js';

async function serve(t, options) {
  const server = createServer(createServerlessHandler(options));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return () => fetch(`http://127.0.0.1:${server.address().port}/api/health`);
}

test('missing deployment database configuration returns actionable JSON rather than crashing', async t => {
  const logs = [];
  const request = await serve(t, { load: () => { readConfig({}); }, onError: code => logs.push(code) });
  const response = await request();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'DATABASE_URL is required.', code: 'DATABASE_URL_MISSING' });
  assert.deepEqual(logs, ['DATABASE_URL_MISSING']);
});

test('invalid deployment settings expose only fixed messages, never supplied values', async t => {
  for (const change of [
    { DATABASE_URL: 'private-password' }, { PORT: 'private-password' },
    { STALE_AFTER_SECONDS: 'private-password' }, { CORS_ORIGINS: 'private-password' },
  ]) {
    const logs = [];
    const request = await serve(t, {
      load: () => { readConfig({ DATABASE_URL: 'postgresql://example.invalid/db', ...change }); },
      onError: code => logs.push(code),
    });
    const response = await request();
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes('private-password'), false);
    assert.equal(JSON.stringify(logs).includes('private-password'), false);
  }
});

test('unexpected startup errors are redacted and initialization is retried next request', async t => {
  let attempts = 0;
  const logs = [];
  const request = await serve(t, {
    load: () => {
      if (++attempts === 1) throw new Error('private-password private-host');
      return { handler: (_req, res) => res.end('{"status":"ok"}') };
    },
    onError: code => logs.push(code),
  });
  const failure = await request();
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: 'API temporarily unavailable.', code: 'API_STARTUP_FAILED' });
  assert.deepEqual(logs, ['API_STARTUP_FAILED']);
  assert.equal((await request()).status, 200);
  assert.equal(attempts, 2);
});

test('concurrent requests share successful initialization and reuse it', async t => {
  let loads = 0;
  let calls = 0;
  const request = await serve(t, {
    load: async () => {
      loads++;
      await new Promise(resolve => setTimeout(resolve, 20));
      return { handler: (_req, res) => { calls++; res.end('ok'); } };
    },
    onError: () => assert.fail('Unexpected startup error'),
  });
  const responses = await Promise.all([request(), request()]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal((await request()).status, 200);
  assert.equal(loads, 1);
  assert.equal(calls, 3);
});
