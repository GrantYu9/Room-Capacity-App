import { ApiError } from './validation.js';
import { communityEstimate } from './community.js';

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
          (device_id, room_id, measured_at, people_count, noise_level, noise_unit, average_confidence)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (device_id, measured_at) DO UPDATE SET device_id = EXCLUDED.device_id
          WHERE existing.room_id = EXCLUDED.room_id
            AND existing.people_count = EXCLUDED.people_count
            AND existing.noise_level = EXCLUDED.noise_level
            AND existing.noise_unit = EXCLUDED.noise_unit
            AND existing.average_confidence IS NOT DISTINCT FROM EXCLUDED.average_confidence
        RETURNING room_id, device_id, measured_at, received_at, people_count, noise_level, noise_unit, average_confidence`,
      [device.device_id, device.room_id, reading.measured_at, reading.people_count, reading.noise_level, reading.noise_unit, reading.average_confidence ?? null]);
      return rows[0] ?? null;
    },
    async rooms(roomId = null) {
      const { rows } = await db.query(`
        SELECT r.*, row_to_json(latest) AS latest_reading
        FROM study_room.rooms r
        LEFT JOIN LATERAL (
          SELECT device_id, measured_at, received_at, people_count, noise_level, noise_unit, average_confidence
          FROM study_room.readings WHERE room_id = r.room_id
          ORDER BY measured_at DESC, received_at DESC, device_id LIMIT 1
        ) latest ON true
        WHERE ($1::text IS NULL OR r.room_id = $1)
        ORDER BY r.room_id`, [roomId]);
      const reports = rows.length ? await db.query(`SELECT room_id, reporter_hash, created_at,
        people_count, occupancy_percent, noise_band FROM study_room.reports
        WHERE room_id = ANY($1::text[]) AND created_at > clock_timestamp() - interval '15 minutes'
        ORDER BY created_at`, [rows.map(r => r.room_id)]) : { rows: [] };
      const byRoom = new Map();
      for (const report of reports.rows) {
        if (!byRoom.has(report.room_id)) byRoom.set(report.room_id, []);
        byRoom.get(report.room_id).push(report);
      }
      return rows.map(row => ({ ...row, community_reports: byRoom.get(row.room_id) ?? [] }));
    },
    async report(report, identity) {
      const pooled = typeof db.release !== 'function';
      const client = pooled ? await db.connect() : db;
      try {
        await client.query(pooled ? 'BEGIN' : 'SAVEPOINT report_write');
        // Database locks and persisted limits work across concurrent serverless instances.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`reporter:${identity.reporter_hash}`]);
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`network:${identity.network_hash}`]);
        const room = (await client.query('SELECT total_capacity FROM study_room.rooms WHERE room_id = $1', [report.room_id])).rows[0];
        if (!room) throw new ApiError(404, 'Room not found.');
        if (report.people_count !== null && room.total_capacity && report.people_count > room.total_capacity * 2 + 10) {
          throw new ApiError(400, 'That count is far above this room’s published capacity. Please check it.');
        }
        const limits = (await client.query(`SELECT
          (SELECT count(*) FROM study_room.reports WHERE reporter_hash = $1 AND created_at > clock_timestamp() - interval '10 minutes') AS browser_count,
          (SELECT count(*) FROM study_room.reports WHERE network_hash = $2 AND created_at > clock_timestamp() - interval '10 minutes') AS network_count,
          EXISTS (SELECT 1 FROM study_room.reports WHERE reporter_hash = $1 AND room_id = $3 AND created_at > clock_timestamp() - interval '5 minutes') AS cooldown`,
        [identity.reporter_hash, identity.network_hash, report.room_id])).rows[0];
        if (limits.cooldown || Number(limits.browser_count) >= 6 || Number(limits.network_count) >= 40) {
          throw new ApiError(429, 'Please wait before reporting again. One report per space every five minutes is allowed.');
        }
        await client.query(`INSERT INTO study_room.reports
          (room_id, reporter_hash, network_hash, people_count, occupancy_percent, noise_band)
          VALUES ($1, $2, $3, $4, $5, $6)`,
        [report.room_id, identity.reporter_hash, identity.network_hash, report.people_count, report.occupancy_percent, report.noise_band]);
        await client.query(pooled ? 'COMMIT' : 'RELEASE SAVEPOINT report_write');
        return { saved: true };
      } catch (error) {
        await client.query(pooled ? 'ROLLBACK' : 'ROLLBACK TO SAVEPOINT report_write').catch(() => {});
        throw error;
      } finally { if (pooled) client.release(); }
    },
    async history(roomId, since, limit, cursor = null) {
      const exists = await db.query('SELECT 1 FROM study_room.rooms WHERE room_id = $1', [roomId]);
      if (!exists.rowCount) return null;
      const { rows } = await db.query(`
        SELECT room_id, device_id, measured_at, received_at, people_count, noise_level, noise_unit, average_confidence
        FROM study_room.readings WHERE room_id = $1 AND measured_at >= $2
          AND ($3::timestamptz IS NULL OR (measured_at, device_id) < ($3::timestamptz, $4::text))
        ORDER BY measured_at DESC, device_id DESC LIMIT $5`,
      [roomId, since, cursor?.measured_at ?? null, cursor?.device_id ?? null, limit + 1]);
      return rows;
    },
  };
}

export function presentRoom(row, staleAfterSeconds, now = Date.now()) {
  const { building, room_number, address, latitude, longitude, community_reports, ...rest } = row;
  const reading = row.latest_reading;
  const stale = !reading || now - Date.parse(reading.measured_at) > staleAfterSeconds * 1000;
  return {
    ...rest,
    location: { building, room_number, address, latitude, longitude },
    stale,
    occupancy_fraction: !stale && row.total_capacity ? reading.people_count / row.total_capacity : null,
    estimate: communityEstimate(row, community_reports, staleAfterSeconds, now),
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
