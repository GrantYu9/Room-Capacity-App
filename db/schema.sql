BEGIN;

CREATE SCHEMA IF NOT EXISTS study_room;

CREATE TABLE IF NOT EXISTS study_room.rooms (
    room_id text PRIMARY KEY CHECK (room_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    building text,
    room_number text,
    address text,
    latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    total_capacity integer CHECK (total_capacity > 0),
    source_url text,
    source_checked_at timestamptz,
    metadata_updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE TABLE IF NOT EXISTS study_room.devices (
    device_id text PRIMARY KEY CHECK (device_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
    room_id text NOT NULL REFERENCES study_room.rooms(room_id),
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_room.readings (
    measured_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    device_id text NOT NULL REFERENCES study_room.devices(device_id),
    room_id text NOT NULL REFERENCES study_room.rooms(room_id),
    people_count integer NOT NULL CHECK (people_count >= 0),
    average_confidence double precision CHECK (average_confidence BETWEEN 0 AND 1),
    noise_level double precision NOT NULL,
    noise_unit text NOT NULL CHECK (noise_unit IN ('relative', 'dBA')),
    PRIMARY KEY (device_id, measured_at),
    CHECK (
        (noise_unit = 'relative' AND noise_level BETWEEN 0 AND 1)
        OR (noise_unit = 'dBA' AND noise_level BETWEEN 0 AND 160)
    )
);

-- Upgrade existing installations too; historical/legacy readings remain unknown.
ALTER TABLE study_room.readings ADD COLUMN IF NOT EXISTS average_confidence
    double precision CHECK (average_confidence BETWEEN 0 AND 1);

SELECT create_hypertable(
    'study_room.readings', 'measured_at',
    chunk_time_interval => INTERVAL '7 days', if_not_exists => true
);

CREATE INDEX IF NOT EXISTS readings_room_time_idx
    ON study_room.readings(room_id, measured_at DESC);

COMMIT;
