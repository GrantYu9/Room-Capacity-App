import { readFile } from 'node:fs/promises';
import { readConfig, safeError } from '../server/config.js';
import { createPool } from '../server/database.js';
import { validateMetadata } from '../server/validation.js';
import { upsertRoom } from '../server/store.js';

const pool = createPool(readConfig());
let client;
try {
  if (process.argv.length !== 3) throw new Error('Usage: npm run rooms:import -- path/to/rooms.json');
  // Reads a local file only. This command makes no requests to UBC websites.
  const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
  if (!Array.isArray(input) || input.length > 10000) throw new Error('Expected a JSON array of at most 10000 rooms.');
  const rooms = input.map(validateMetadata);
  if (new Set(rooms.map(r => r.room_id)).size !== rooms.length) throw new Error('Duplicate room IDs in input.');
  client = await pool.connect();
  await client.query('BEGIN');
  for (const room of rooms) await upsertRoom(client, room);
  await client.query('COMMIT');
  console.log(`Imported ${rooms.length} room metadata records from the local file. No websites were scraped.`);
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(error.code ? safeError(error) : error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
