CREATE TABLE IF NOT EXISTS smart_collections (
  id UUID PRIMARY KEY,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_area TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT smart_collection_owner_check CHECK ((owner_user_id IS NOT NULL)::int + (student_id IS NOT NULL)::int = 1),
  CONSTRAINT smart_collection_name_bound CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT smart_collection_description_bound CHECK (char_length(description) <= 1000),
  CONSTRAINT smart_collection_area_allowlist CHECK (workspace_area IS NULL OR workspace_area IN ('learning','work','research','personal','creative','daily_life'))
);
CREATE INDEX IF NOT EXISTS smart_collections_user_updated_idx ON smart_collections(owner_user_id,updated_at DESC) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS smart_collections_student_updated_idx ON smart_collections(student_id,updated_at DESC) WHERE student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS smart_collection_items (
  collection_id UUID NOT NULL REFERENCES smart_collections(id) ON DELETE CASCADE,
  memory_record_id UUID NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(collection_id,memory_record_id)
);
CREATE INDEX IF NOT EXISTS smart_collection_items_record_idx ON smart_collection_items(memory_record_id,collection_id);

CREATE TABLE IF NOT EXISTS intelligence_feedback (
  id UUID PRIMARY KEY,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  suggestion_key TEXT NOT NULL DEFAULT '',
  context_record_id UUID REFERENCES memory_records(id) ON DELETE CASCADE,
  target_record_id UUID REFERENCES memory_records(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intelligence_feedback_owner_check CHECK ((owner_user_id IS NOT NULL)::int + (student_id IS NOT NULL)::int = 1),
  CONSTRAINT intelligence_feedback_type_allowlist CHECK (suggestion_type IN ('related_note','area','content_type','tag','continue','collection','next_action')),
  CONSTRAINT intelligence_feedback_value_allowlist CHECK (feedback IN ('helpful','not_helpful')),
  CONSTRAINT intelligence_feedback_key_bound CHECK (char_length(suggestion_key) <= 120)
);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_feedback_user_fingerprint_idx ON intelligence_feedback(owner_user_id,fingerprint) WHERE owner_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_feedback_student_fingerprint_idx ON intelligence_feedback(student_id,fingerprint) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS intelligence_feedback_user_recent_idx ON intelligence_feedback(owner_user_id,updated_at DESC) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS intelligence_feedback_student_recent_idx ON intelligence_feedback(student_id,updated_at DESC) WHERE student_id IS NOT NULL;
