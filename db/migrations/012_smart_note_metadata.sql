ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS workspace_area TEXT NOT NULL DEFAULT 'research';
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'research';
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS custom_title TEXT;
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS note_metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE memory_records ADD CONSTRAINT memory_workspace_area_allowlist CHECK (workspace_area IN ('learning','work','research','personal','creative','daily_life'));
ALTER TABLE memory_records ADD CONSTRAINT memory_content_type_allowlist CHECK (content_type IN ('research','note','meeting','project','idea','draft','journal','list','plan','reference'));
ALTER TABLE memory_records ADD CONSTRAINT memory_custom_title_bound CHECK (custom_title IS NULL OR char_length(custom_title) <= 120);
ALTER TABLE memory_records ADD CONSTRAINT memory_tags_bound CHECK (cardinality(tags) <= 8);

CREATE INDEX IF NOT EXISTS memory_user_area_type_updated_idx ON memory_records (owner_user_id, workspace_area, content_type, updated_at DESC) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memory_student_area_type_updated_idx ON memory_records (student_id, workspace_area, content_type, updated_at DESC) WHERE student_id IS NOT NULL;
