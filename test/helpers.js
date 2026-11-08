import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHandler } from '../server/handler.js';

export async function serve(store, options = {}) {
  const config = { origins: ['http://localhost:5173'], staleAfterSeconds: 60 };
  const server = createServer(createHandler(store, config, { onError: () => {}, ...options }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    async request(path, options) {
      const response = await fetch(base + path, options);
      const text = await response.text();
      return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
    },
    close() { return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}

export const token = 'a'.repeat(64);
export function reading(overrides = {}) {
  return { room_id: 'room-1', people_count: 4, noise_level: 0.35, noise_unit: 'relative',
    measured_at: new Date().toISOString(), ...overrides };
}
export function post(body, auth = token) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: JSON.stringify(body) };
}
