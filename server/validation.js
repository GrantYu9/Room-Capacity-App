export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateId(value, field = 'room_id') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
    throw new ApiError(400, `${field} must be 1–64 letters, digits, underscores, or hyphens.`);
  }
  return value;
}

export function timestamp(value, field = 'measured_at') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !Number.isFinite(Date.parse(value))) {
    throw new ApiError(400, `${field} must be an ISO timestamp with a timezone.`);
  }
  // Date.parse normalizes impossible dates such as February 30; reject those too.
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > days || Number(value.slice(11, 13)) > 23) {
    throw new ApiError(400, `${field} is not a real date.`);
  }
  return new Date(value).toISOString();
}

export function validateReading(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Expected a JSON object.');
  const fields = ['room_id', 'people_count', 'noise_level', 'noise_unit', 'measured_at'];
  if (Object.keys(body).some(k => !fields.includes(k))) throw new ApiError(400, 'Unknown reading field.');
  const room_id = validateId(body.room_id);
  if (!Number.isInteger(body.people_count) || body.people_count < 0 || body.people_count > 2147483647) {
    throw new ApiError(400, 'people_count must be a nonnegative integer.');
  }
  if (!['relative', 'dBA'].includes(body.noise_unit)) throw new ApiError(400, 'noise_unit must be relative or dBA.');
  const max = body.noise_unit === 'relative' ? 1 : 160;
  if (typeof body.noise_level !== 'number' || !Number.isFinite(body.noise_level)
      || body.noise_level < 0 || body.noise_level > max) {
    throw new ApiError(400, `noise_level must be between 0 and ${max} for ${body.noise_unit}.`);
  }
  const measured_at = timestamp(body.measured_at);
  if (Date.parse(measured_at) > now + 60000) throw new ApiError(400, 'measured_at is more than 60 seconds in the future.');
  return { room_id, people_count: body.people_count, noise_level: body.noise_level, noise_unit: body.noise_unit, measured_at };
}

export function validateMetadata(room) {
  if (!room || typeof room !== 'object' || Array.isArray(room)) throw new ApiError(400, 'Each room must be an object.');
  const allowed = ['room_id', 'name', 'building', 'room_number', 'address', 'latitude', 'longitude', 'total_capacity', 'source_url', 'source_checked_at'];
  if (Object.keys(room).some(key => !allowed.includes(key))) throw new ApiError(400, 'Unknown room metadata field.');
  const result = { room_id: validateId(room.room_id) };
  if (typeof room.name !== 'string' || !room.name.trim() || room.name.length > 200) {
    throw new ApiError(400, 'Each room needs a name of 1–200 characters.');
  }
  result.name = room.name.trim();
  for (const field of ['building', 'room_number', 'address']) {
    const value = room[field] ?? null;
    if (value !== null && (typeof value !== 'string' || value.length > 500)) throw new ApiError(400, `${field} must be text or null.`);
    result[field] = value;
  }
  result.total_capacity = room.total_capacity ?? null;
  if (result.total_capacity !== null && (!Number.isInteger(result.total_capacity) || result.total_capacity <= 0 || result.total_capacity > 2147483647)) {
    throw new ApiError(400, 'total_capacity must be a positive integer or null.');
  }
  result.latitude = room.latitude ?? null;
  result.longitude = room.longitude ?? null;
  if ((result.latitude === null) !== (result.longitude === null)) throw new ApiError(400, 'Supply both latitude and longitude, or neither.');
  for (const [field, bound] of [['latitude', 90], ['longitude', 180]]) {
    if (result[field] !== null && (typeof result[field] !== 'number' || !Number.isFinite(result[field]) || Math.abs(result[field]) > bound)) {
      throw new ApiError(400, `${field} is outside its valid range.`);
    }
  }
  result.source_url = room.source_url ?? null;
  if (result.source_url !== null) {
    if (typeof result.source_url !== 'string') throw new ApiError(400, 'source_url must be a UBC HTTPS URL or null.');
    let url;
    try { url = new URL(result.source_url); } catch { throw new ApiError(400, 'source_url must be a UBC HTTPS URL or null.'); }
    if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname === 'ubc.ca' || url.hostname.endsWith('.ubc.ca'))) {
      throw new ApiError(400, 'source_url must be a UBC HTTPS URL or null.');
    }
  }
  result.source_checked_at = room.source_checked_at == null ? null : timestamp(room.source_checked_at, 'source_checked_at');
  if (result.source_checked_at && !result.source_url) throw new ApiError(400, 'source_checked_at requires source_url.');
  return result;
}

export function parseCursor(value, roomId) {
  try {
    if (!/^[a-zA-Z0-9_-]{1,512}$/.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (cursor.room_id !== roomId) throw new Error();
    return {
      room_id: roomId,
      measured_at: timestamp(cursor.measured_at),
      device_id: validateId(cursor.device_id, 'device_id'),
      since: timestamp(cursor.since, 'since'),
    };
  } catch { throw new ApiError(400, 'Invalid history cursor.'); }
}
