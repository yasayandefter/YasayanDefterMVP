ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('USER', 'STUDENT', 'TEACHER'));

ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE memory_records ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE memory_records ADD CONSTRAINT memory_records_owner_check CHECK ((student_id IS NOT NULL)::int + (owner_user_id IS NOT NULL)::int = 1);
CREATE UNIQUE INDEX IF NOT EXISTS memory_records_user_topic_idx ON memory_records (owner_user_id, normalized_topic) WHERE owner_user_id IS NOT NULL;

ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE quiz_attempts ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_owner_check CHECK ((student_id IS NOT NULL)::int + (owner_user_id IS NOT NULL)::int = 1);
CREATE INDEX IF NOT EXISTS quiz_attempts_owner_user_idx ON quiz_attempts (owner_user_id);

ALTER TABLE xp_events ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE xp_events ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE xp_events ADD CONSTRAINT xp_events_owner_check CHECK ((student_id IS NOT NULL)::int + (owner_user_id IS NOT NULL)::int = 1);
CREATE INDEX IF NOT EXISTS xp_events_owner_user_idx ON xp_events (owner_user_id);
