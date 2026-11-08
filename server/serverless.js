import { ConfigurationError } from './config.js';

// Importing the runtime can fail before createHandler's request error handling
// runs. Keep that initialization inside a handler so Vercel returns safe JSON
// instead of a generic FUNCTION_INVOCATION_FAILED page.
export function createServerlessHandler({
  load = () => import('./runtime.js'),
  onError = code => console.error(`API startup failed (${code}).`),
} = {}) {
  let runtime;
  return async (req, res) => {
    let handler;
    try {
      runtime ??= Promise.resolve(load());
      ({ handler } = await runtime);
      if (typeof handler !== 'function') throw new Error('Missing API handler');
    } catch (error) {
      runtime = null;
      const configuration = error instanceof ConfigurationError;
      const code = configuration ? error.code : 'API_STARTUP_FAILED';
      onError(code);
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(JSON.stringify({ error: configuration ? error.message : 'API temporarily unavailable.', code }));
      return;
    }
    return handler(req, res);
  };
}

export const handler = createServerlessHandler();
