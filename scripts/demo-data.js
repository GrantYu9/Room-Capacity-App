import { createHash, randomBytes } from 'node:crypto';

// Demo devices cannot authenticate uploads; no usable token is stored anywhere.
export function demoPayload(rooms, now = Date.now(), history = true) {
  const end = Math.floor(now / 20000) * 20000;
  return rooms.map(room => {
    const hash = createHash('sha256').update(room.room_id).digest('hex');
    const phase = parseInt(hash.slice(0, 8), 16) / 0xffffffff * Math.PI * 2;
    const readings = Array.from({ length: history ? 73 : 1 }, (_, i) => {
      const time = end - (history ? 72 - i : 0) * 300000;
      const fraction = Math.max(0, Math.min(1, 0.48 + 0.36 * Math.sin(time / 1800000 + phase) + 0.12 * Math.sin(phase * 3)));
      return {
        measured_at: new Date(time).toISOString(),
        people_count: Math.round((room.total_capacity ?? 20) * fraction),
        noise_level: Number(Math.max(0.03, Math.min(0.95, 0.08 + fraction * 0.7 + 0.08 * Math.sin(phase))).toFixed(3)),
        noise_unit: 'relative',
      };
    });
    return { ...room, device_id: `demo-${hash.slice(0, 24)}`, token_hash: randomBytes(32).toString('hex'), readings };
  });
}

// One atomic statement: add missing metadata, preserve existing metadata/devices,
// and make repeated runs safe for the same device/timestamp.
export const seedSql = `WITH input AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
    room_id text, name text, building text, room_number text, address text,
    latitude double precision, longitude double precision, total_capacity integer,
    source_url text, source_checked_at timestamptz,
    device_id text, token_hash text, readings jsonb)
), rooms AS (
  INSERT INTO study_room.rooms (room_id, name, building, room_number, address,
    latitude, longitude, total_capacity, source_url, source_checked_at)
  SELECT room_id, name, building, room_number, address, latitude, longitude,
    total_capacity, source_url, source_checked_at FROM input
  ON CONFLICT (room_id) DO UPDATE SET room_id = EXCLUDED.room_id
  RETURNING room_id
), devices AS (
  INSERT INTO study_room.devices AS d (device_id, room_id, token_hash, active)
  SELECT i.device_id, i.room_id, i.token_hash, false FROM input i JOIN rooms r USING (room_id)
  ON CONFLICT (device_id) DO UPDATE SET device_id = EXCLUDED.device_id
    WHERE d.room_id = EXCLUDED.room_id AND d.active = false
  RETURNING device_id, room_id
), readings AS (
  INSERT INTO study_room.readings (room_id, device_id, measured_at, people_count, noise_level, noise_unit)
  SELECT i.room_id, i.device_id, v.measured_at, v.people_count, v.noise_level, v.noise_unit
  FROM input i JOIN devices d USING (device_id, room_id)
  CROSS JOIN LATERAL jsonb_to_recordset(i.readings) AS v(
    measured_at timestamptz, people_count integer, noise_level double precision, noise_unit text)
  ON CONFLICT (device_id, measured_at) DO NOTHING
  RETURNING room_id
)
SELECT (SELECT count(*) FROM rooms) AS rooms,
  (SELECT count(DISTINCT building) FROM input) AS buildings,
  (SELECT count(*) FROM devices) AS demo_devices,
  (SELECT count(*) FROM readings) AS inserted_readings`;
