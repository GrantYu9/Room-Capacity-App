import { createHash } from 'node:crypto';
import { ApiError, validateId, validateReading, timestamp, parseCursor } from './validation.js';
import { presentRoom } from './store.js';

async function readBody(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'Content-Type must be application/json.');
  }
  let body = req.body;
  if (body !== undefined) {
    const raw = Buffer.isBuffer(body) ? body.toString('utf8') : typeof body === 'string' ? body : JSON.stringify(body);
    if (Buffer.byteLength(raw) > 4096) throw new ApiError(413, 'Reading body exceeds 4096 bytes.');
    try { return JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid JSON.'); }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 4096) chunks.push(chunk);
  }
  if (size > 4096) throw new ApiError(413, 'Reading body exceeds 4096 bytes.');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'Invalid JSON.'); }
}

export function createHandler(store, config, { now = Date.now, onError = () => console.error('API database operation failed.') } = {}) {
  return async function handler(req, res) {
    const send = (status, value) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(value));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    try {
      const origin = req.headers.origin;
      if (origin && !config.origins.includes(origin)) throw new ApiError(403, 'Origin is not allowed.');
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      const url = new URL(req.url, 'http://api.local');
      const methods = {
        '/api/health': ['GET'], '/api/rooms': ['GET'], '/api/readings': ['GET', 'POST'],
      }[url.pathname];
      if (!methods) throw new ApiError(404, 'Endpoint not found.');
      res.setHeader('Allow', [...methods, 'OPTIONS'].join(', '));
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.statusCode = 204;
        return res.end();
      }
      if (!methods.includes(req.method)) throw new ApiError(405, 'Method not allowed.');
      if (url.pathname === '/api/health') {
        await store.health();
        return send(200, { status: 'ok' });
      }
      if (url.pathname === '/api/rooms') {
        const id = url.searchParams.get('room_id');
        if (id !== null) validateId(id);
        const rooms = await store.rooms(id);
        if (id !== null && !rooms.length) throw new ApiError(404, 'Room not found.');
        return send(200, { rooms: rooms.map(r => presentRoom(r, config.staleAfterSeconds, now())), stale_after_seconds: config.staleAfterSeconds });
      }
      if (req.method === 'GET') {
        const id = validateId(url.searchParams.get('room_id'));
        const cursor = url.searchParams.has('cursor') ? parseCursor(url.searchParams.get('cursor'), id) : null;
        const since = url.searchParams.has('since') ? timestamp(url.searchParams.get('since'), 'since') : cursor?.since ?? new Date(now() - 86400000).toISOString();
        if (cursor && cursor.since !== since) throw new ApiError(400, 'since must match the history cursor.');
        const rawLimit = url.searchParams.get('limit') ?? '1000';
        if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 1000) throw new ApiError(400, 'limit must be an integer from 1 to 1000.');
        const limit = Number(rawLimit);
        const rows = await store.history(id, since, limit, cursor);
        if (rows === null) throw new ApiError(404, 'Room not found.');
        const hasMore = rows.length > limit;
        const readings = rows.slice(0, limit);
        const last = readings.at(-1);
        const nextCursor = hasMore ? Buffer.from(JSON.stringify({
          room_id: id, measured_at: last.measured_at, device_id: last.device_id, since,
        })).toString('base64url') : null;
        return send(200, { room_id: id, readings: readings.reverse(), has_more: hasMore, next_cursor: nextCursor, since });
      }
      const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
      if (!token) throw new ApiError(401, 'A valid device bearer token is required.');
      const device = await store.findDevice(createHash('sha256').update(token).digest('hex'));
      if (!device) throw new ApiError(401, 'A valid device bearer token is required.');
      const reading = validateReading(await readBody(req), now());
      if (reading.room_id !== device.room_id) throw new ApiError(403, 'Device is not assigned to this room.');
      const saved = await store.record(device, reading);
      if (!saved) throw new ApiError(409, 'A different reading already exists for this device and timestamp.');
      return send(200, { reading: saved });
    } catch (error) {
      if (error instanceof ApiError) return send(error.status, { error: error.message });
      onError();
      return send(503, { error: 'Database temporarily unavailable.' });
    }
  };
}
