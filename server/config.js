import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const localEnv = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(localEnv)) loadEnvFile(localEnv);

const configurationMessages = {
  DATABASE_URL_MISSING: 'DATABASE_URL is required.',
  DATABASE_URL_INVALID: 'DATABASE_URL must be a valid PostgreSQL URL.',
  PORT_INVALID: 'PORT is invalid.',
  STALE_AFTER_SECONDS_INVALID: 'STALE_AFTER_SECONDS must be positive.',
  CORS_ORIGINS_INVALID: 'CORS_ORIGINS must contain full HTTP(S) origins without paths or wildcards.',
};

export class ConfigurationError extends Error {
  constructor(code) {
    super(configurationMessages[code] ?? 'Server configuration is invalid.');
    this.code = Object.hasOwn(configurationMessages, code) ? code : 'SERVER_CONFIGURATION_INVALID';
  }
}

export function readConfig(env = process.env) {
  if (!env.DATABASE_URL) throw new ConfigurationError('DATABASE_URL_MISSING');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new ConfigurationError('DATABASE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new ConfigurationError('DATABASE_URL_INVALID');
  }
  // Match psql/Tiger's explicit sslmode=require semantics on shared services.
  // pg 8 otherwise treats require as verify-full; do not override verify-full.
  if (url.searchParams.get('sslmode') === 'require' && !url.searchParams.has('uselibpqcompat')) {
    url.searchParams.set('uselibpqcompat', 'true');
  }
  const port = Number(env.PORT || 3000);
  const staleAfterSeconds = Number(env.STALE_AFTER_SECONDS || 60);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigurationError('PORT_INVALID');
  if (!Number.isFinite(staleAfterSeconds) || staleAfterSeconds <= 0) {
    throw new ConfigurationError('STALE_AFTER_SECONDS_INVALID');
  }
  const origins = (env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',').map(x => x.trim()).filter(Boolean);
  for (const origin of origins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new ConfigurationError('CORS_ORIGINS_INVALID'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new ConfigurationError('CORS_ORIGINS_INVALID');
    }
  }
  return { databaseUrl: url.toString(), port, staleAfterSeconds, origins,
    reportSecret: env.REPORT_SECRET, trustVercel: env.VERCEL === '1' };
}

export function safeError(error) {
  const code = /^[A-Z0-9_]{1,32}$/.test(error?.code || '') ? error.code : 'unknown';
  if (code === '28P01') return 'Database password rejected.';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Database hostname could not be resolved.';
  if (code === '42P01' || code === '3F000') return 'Database schema is missing. Run npm run db:init.';
  if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') return 'Dependencies are missing. Run npm install.';
  return `Operation failed (${code}). Connection details have been withheld.`;
}
