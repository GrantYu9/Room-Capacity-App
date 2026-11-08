import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const localEnv = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(localEnv)) loadEnvFile(localEnv);

export function readConfig(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL is invalid.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  }
  // Match psql/Tiger's explicit sslmode=require semantics on shared services.
  // pg 8 otherwise treats require as verify-full; do not override verify-full.
  if (url.searchParams.get('sslmode') === 'require' && !url.searchParams.has('uselibpqcompat')) {
    url.searchParams.set('uselibpqcompat', 'true');
  }
  const port = Number(env.PORT || 3000);
  const staleAfterSeconds = Number(env.STALE_AFTER_SECONDS || 60);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid.');
  if (!Number.isFinite(staleAfterSeconds) || staleAfterSeconds <= 0) {
    throw new Error('STALE_AFTER_SECONDS must be positive.');
  }
  const origins = (env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',').map(x => x.trim()).filter(Boolean);
  for (const origin of origins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('CORS_ORIGINS must contain full origins.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('CORS_ORIGINS must contain full origins without paths or wildcards.');
    }
  }
  return { databaseUrl: url.toString(), port, staleAfterSeconds, origins };
}

export function safeError(error) {
  const code = /^[A-Z0-9_]{1,32}$/.test(error?.code || '') ? error.code : 'unknown';
  if (code === '28P01') return 'Database password rejected.';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Database hostname could not be resolved.';
  if (code === '42P01' || code === '3F000') return 'Database schema is missing. Run npm run db:init.';
  if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') return 'Dependencies are missing. Run npm install.';
  return `Operation failed (${code}). Connection details have been withheld.`;
}
