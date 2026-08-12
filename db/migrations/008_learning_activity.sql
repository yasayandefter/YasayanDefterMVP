CREATE TABLE IF NOT EXISTS research_activity_events (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT research_activity_owner_check CHECK ((student_id IS NOT NULL)::int + (owner_user_id IS NOT NULL)::int = 1)
);

CREATE INDEX IF NOT EXISTS research_activity_student_completed_idx ON research_activity_events (student_id, completed_at DESC) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS research_activity_user_completed_idx ON research_activity_events (owner_user_id, completed_at DESC) WHERE owner_user_id IS NOT NULL;
