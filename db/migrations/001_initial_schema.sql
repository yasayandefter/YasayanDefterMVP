CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'TEACHER')),
  email TEXT,
  username TEXT,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classroom_memberships (
  id UUID PRIMARY KEY,
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'TEACHER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (classroom_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS memory_records (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  topic TEXT NOT NULL,
  normalized_topic TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  confidence NUMERIC NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  audience_level TEXT NOT NULL DEFAULT 'general',
  times_searched INTEGER NOT NULL DEFAULT 1,
  key_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  reliability_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  quiz_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, normalized_topic)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  question_type TEXT NOT NULL,
  status TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_attempt_questions (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option_private TEXT NOT NULL,
  concept TEXT,
  UNIQUE (attempt_id, ordinal)
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_attempt_questions(id) ON DELETE CASCADE,
  answer TEXT NOT NULL DEFAULT '',
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS xp_events (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
