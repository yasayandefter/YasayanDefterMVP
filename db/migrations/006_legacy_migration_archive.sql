CREATE TABLE IF NOT EXISTS legacy_unassigned_quiz_attempts (
  id UUID PRIMARY KEY,
  legacy_attempt_id TEXT NOT NULL,
  legacy_student_reference TEXT NULL,
  snapshot_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  reason_code TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL,
  UNIQUE (snapshot_hash, legacy_attempt_id)
);

CREATE TABLE IF NOT EXISTS legacy_unassigned_memory (
  id UUID PRIMARY KEY,
  legacy_record_id TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  reason_code TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL,
  UNIQUE (snapshot_hash, legacy_record_id)
);
