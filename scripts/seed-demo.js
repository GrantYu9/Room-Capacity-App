import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { demoPayload, seedSql } from './demo-data.js';
import { validateMetadata } from '../server/validation.js';

const args = new Set(process.argv.slice(2));
if ([...args].some(arg => !['--watch', '--payload'].includes(arg))) {
  throw new Error('Usage: npm run db:demo -- [--watch]');
}
const rooms = JSON.parse(await readFile(new URL('../data/rooms.json', import.meta.url), 'utf8')).map(validateMetadata);
if (args.has('--payload')) {
  console.log(JSON.stringify({ query: seedSql, parameters: [JSON.stringify(demoPayload(rooms))] }));
} else {
  const { readConfig, safeError } = await import('../server/config.js');
  const { createPool } = await import('../server/database.js');
  const pool = createPool(readConfig());
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
  try {
    let first = true;
    do {
      const result = await pool.query(seedSql, [JSON.stringify(demoPayload(rooms, Date.now(), first))]);
      if (first) console.log(JSON.stringify({ fictional: true, ...result.rows[0] }));
      first = false;
      if (!args.has('--watch')) break;
      await delay(20000, undefined, { signal: controller.signal });
    } while (!controller.signal.aborted);
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(safeError(error));
      process.exitCode = 1;
    }
  } finally { await pool.end(); }
}
