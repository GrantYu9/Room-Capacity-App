-- Additive migration, safe to run on an already initialized database.
CREATE TABLE IF NOT EXISTS study_room.reports (
  report_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id text NOT NULL REFERENCES study_room.rooms(room_id),
  reporter_hash text NOT NULL CHECK (reporter_hash ~ '^[0-9a-f]{64}$'),
  network_hash text NOT NULL CHECK (network_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  people_count integer CHECK (people_count BETWEEN 0 AND 10000),
  occupancy_percent double precision CHECK (occupancy_percent BETWEEN 0 AND 100),
  noise_band text CHECK (noise_band IN ('quiet', 'moderate', 'lively')),
  CHECK (people_count IS NULL OR occupancy_percent IS NULL),
  CHECK (people_count IS NOT NULL OR occupancy_percent IS NOT NULL OR noise_band IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS reports_room_time_idx ON study_room.reports(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_reporter_time_idx ON study_room.reports(reporter_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_network_time_idx ON study_room.reports(network_hash, created_at DESC);
