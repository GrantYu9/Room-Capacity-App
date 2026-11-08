import { createServer } from 'node:http';
import { config, pool, handler } from './runtime.js';

const server = createServer(handler);
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(config.port, '0.0.0.0', () => console.log(`Study room API listening on port ${config.port}.`));
server.on('error', () => { console.error('API server could not start. Check PORT.'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { server.close(async () => { await pool.end(); process.exit(0); }); });
}
