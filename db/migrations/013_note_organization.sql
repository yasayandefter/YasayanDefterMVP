ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS memory_user_organization_idx
  ON memory_records (owner_user_id, is_archived, is_pinned DESC, updated_at DESC)
  WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memory_student_organization_idx
  ON memory_records (student_id, is_archived, is_pinned DESC, updated_at DESC)
  WHERE student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_note_filter_presets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  workspace_area TEXT,
  content_type TEXT,
  archive_state TEXT NOT NULL DEFAULT 'active',
  sort_order TEXT NOT NULL DEFAULT 'updated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT note_preset_name_bound CHECK (char_length(name) BETWEEN 1 AND 40),
  CONSTRAINT note_preset_area_allowlist CHECK (workspace_area IS NULL OR workspace_area IN ('learning','work','research','personal','creative','daily_life')),
  CONSTRAINT note_preset_type_allowlist CHECK (content_type IS NULL OR content_type IN ('research','note','meeting','project','idea','draft','journal','list','plan','reference')),
  CONSTRAINT note_preset_archive_allowlist CHECK (archive_state IN ('active','archived','all')),
  CONSTRAINT note_preset_sort_allowlist CHECK (sort_order IN ('updated','newest','oldest','title'))
);
CREATE INDEX IF NOT EXISTS note_filter_presets_user_idx ON user_note_filter_presets (user_id, created_at, id);
