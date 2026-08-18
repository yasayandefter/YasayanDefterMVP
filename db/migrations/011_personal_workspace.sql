CREATE TABLE IF NOT EXISTS user_workspace_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  selected_areas TEXT[] NOT NULL DEFAULT ARRAY['research', 'personal']::TEXT[],
  primary_area TEXT NOT NULL DEFAULT 'research',
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_selected_areas_count CHECK (cardinality(selected_areas) BETWEEN 1 AND 6),
  CONSTRAINT workspace_selected_areas_allowlist CHECK (selected_areas <@ ARRAY['learning', 'work', 'research', 'personal', 'creative', 'daily_life']::TEXT[]),
  CONSTRAINT workspace_selected_areas_unique CHECK (
    cardinality(array_positions(selected_areas, 'learning')) <= 1 AND
    cardinality(array_positions(selected_areas, 'work')) <= 1 AND
    cardinality(array_positions(selected_areas, 'research')) <= 1 AND
    cardinality(array_positions(selected_areas, 'personal')) <= 1 AND
    cardinality(array_positions(selected_areas, 'creative')) <= 1 AND
    cardinality(array_positions(selected_areas, 'daily_life')) <= 1
  ),
  CONSTRAINT workspace_primary_area_allowlist CHECK (primary_area IN ('learning', 'work', 'research', 'personal', 'creative', 'daily_life')),
  CONSTRAINT workspace_primary_selected CHECK (primary_area = ANY(selected_areas))
);

-- 15.3 hesapları kesintisiz açılır; yeni hesaplarda satır yokluğu onboarding'i tetikler.
INSERT INTO user_workspace_preferences (user_id, selected_areas, primary_area, onboarding_completed)
SELECT id, ARRAY['research', 'personal']::TEXT[], 'research', TRUE FROM users
ON CONFLICT (user_id) DO NOTHING;
