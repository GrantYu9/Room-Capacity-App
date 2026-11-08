import pg from 'pg';

export function createPool(config) {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
    application_name: 'study-room-api',
  });
  // Never print connection errors: they can include connection details.
  pool.on('error', () => console.error('An idle database connection failed.'));
  return pool;
}
