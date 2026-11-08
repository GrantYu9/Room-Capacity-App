import { readFile } from 'node:fs/promises';
import { readConfig, safeError } from '../server/config.js';
import { createPool } from '../server/database.js';

const pool = createPool(readConfig());
try {
  const command = process.argv[2];
  if (command === 'init') {
    await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    console.log('Room, device, and time-series reading tables are ready.');
  } else if (command === 'check') {
    const { rows } = await pool.query(`SELECT
      EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') AS timescaledb,
      to_regclass('study_room.rooms') IS NOT NULL AS rooms,
      to_regclass('study_room.devices') IS NOT NULL AS devices,
      to_regclass('study_room.readings') IS NOT NULL AS readings`);
    console.log(JSON.stringify({ connected: true, ...rows[0] }));
  } else {
    console.error('Use npm run db:check or npm run db:init.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
} finally { await pool.end(); }
