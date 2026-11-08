export function createStore(db) {
  return {
    async health() { await db.query('SELECT 1'); },
    async findDevice(hash) {
      const { rows } = await db.query(
        'SELECT device_id, room_id FROM study_room.devices WHERE token_hash = $1 AND active = true', [hash]);
      return rows[0] ?? null;
    },
    async record(device, reading) {
      const { rows } = await db.query(`
        INSERT INTO study_room.readings AS existing
          (device_id, room_id, measured_at, people_count, noise_level, noise_unit)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (device_id, measured_at) DO UPDATE SET device_id = EXCLUDED.device_id
          WHERE existing.room_id = EXCLUDED.room_id
            AND existing.people_count = EXCLUDED.people_count
            AND existing.noise_level = EXCLUDED.noise_level
            AND existing.noise_unit = EXCLUDED.noise_unit
        RETURNING room_id, device_id, measured_at, received_at, people_count, noise_level, noise_unit`,
      [device.device_id, device.room_id, reading.measured_at, reading.people_count, reading.noise_level, reading.noise_unit]);
      return rows[0] ?? null;
    },
    async rooms(roomId = null) {
      const { rows } = await db.query(`
        SELECT r.*, row_to_json(latest) AS latest_reading
        FROM study_room.rooms r
        LEFT JOIN LATERAL (
          SELECT device_id, measured_at, received_at, people_count, noise_level, noise_unit
          FROM study_room.readings WHERE room_id = r.room_id
          ORDER BY measured_at DESC, received_at DESC, device_id LIMIT 1
        ) latest ON true
        WHERE ($1::text IS NULL OR r.room_id = $1)
        ORDER BY r.room_id`, [roomId]);
      return rows;
    },
    async history(roomId, since, limit, cursor = null) {
      const exists = await db.query('SELECT 1 FROM study_room.rooms WHERE room_id = $1', [roomId]);
      if (!exists.rowCount) return null;
      const { rows } = await db.query(`
        SELECT room_id, device_id, measured_at, received_at, people_count, noise_level, noise_unit
        FROM study_room.readings WHERE room_id = $1 AND measured_at >= $2
          AND ($3::timestamptz IS NULL OR (measured_at, device_id) < ($3::timestamptz, $4::text))
        ORDER BY measured_at DESC, device_id DESC LIMIT $5`,
      [roomId, since, cursor?.measured_at ?? null, cursor?.device_id ?? null, limit + 1]);
      return rows;
    },
  };
}

export function presentRoom(row, staleAfterSeconds, now = Date.now()) {
  const { building, room_number, address, latitude, longitude, ...rest } = row;
  const reading = row.latest_reading;
  const stale = !reading || now - Date.parse(reading.measured_at) > staleAfterSeconds * 1000;
  return {
    ...rest,
    location: { building, room_number, address, latitude, longitude },
    stale,
    occupancy_fraction: !stale && row.total_capacity ? reading.people_count / row.total_capacity : null,
  };
}

export async function upsertRoom(db, room) {
  const fields = ['room_id', 'name', 'building', 'room_number', 'address', 'latitude', 'longitude', 'total_capacity', 'source_url', 'source_checked_at'];
  await db.query(`INSERT INTO study_room.rooms (${fields.join(',')})
    VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')})
    ON CONFLICT (room_id) DO UPDATE SET
      ${fields.slice(1).map(f => `${f} = EXCLUDED.${f}`).join(',')}, metadata_updated_at = now()`,
  fields.map(f => room[f]));
}
