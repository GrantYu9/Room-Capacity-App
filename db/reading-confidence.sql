-- Additive migration for existing Timescale/PostgreSQL installations.
ALTER TABLE study_room.readings ADD COLUMN IF NOT EXISTS average_confidence
    double precision CHECK (average_confidence BETWEEN 0 AND 1);
