import { writeFileSync, existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { readConfig, safeError } from '../server/config.js';
import { createPool } from '../server/database.js';
import { validateId } from '../server/validation.js';

const pool = createPool(readConfig());
let client;
try {
  const { values } = parseArgs({ options: {
    room: { type: 'string' }, device: { type: 'string' }, name: { type: 'string' },
    output: { type: 'string', default: '.env.pi' },
    'api-url': { type: 'string', default: 'http://localhost:3000' },
  } });
  const room = validateId(values.room);
  const device = validateId(values.device, 'device_id');
  const name = values.name ?? room;
  if (!name.trim() || name.length > 200) throw new Error('Room name must have 1–200 characters.');
  const url = new URL(values['api-url']);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('api-url must be an HTTP(S) origin without a path or credentials.');
  }
  if (existsSync(values.output)) throw new Error('Output file already exists. Choose another --output file; existing credentials are preserved.');
  client = await pool.connect();
  await client.query('BEGIN');
  const existing = await client.query('SELECT 1 FROM study_room.devices WHERE device_id = $1', [device]);
  if (existing.rowCount) throw new Error('Device ID already exists. Choose a new --device ID.');
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  await client.query('INSERT INTO study_room.rooms (room_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [room, name]);
  await client.query('INSERT INTO study_room.devices (device_id, room_id, token_hash) VALUES ($1, $2, $3)', [device, room, hash]);
  writeFileSync(values.output, `API_URL=${url.origin}\nROOM_ID=${room}\nDEVICE_ID=${device}\nDEVICE_TOKEN=${token}\n`, { flag: 'wx', mode: 0o600 });
  await client.query('COMMIT');
  console.log(`Registered device ${device} for room ${room}. Credentials saved privately to ${values.output}.`);
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(error.code ? safeError(error) : error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
