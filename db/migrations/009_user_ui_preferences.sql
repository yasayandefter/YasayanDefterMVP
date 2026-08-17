ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB NOT NULL
  DEFAULT '{"theme":"living","notebookWritingStyle":"modern","notebookPageStyle":"plain"}'::jsonb;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_ui_preferences_check;
ALTER TABLE users ADD CONSTRAINT users_ui_preferences_check CHECK (
  jsonb_typeof(ui_preferences) = 'object'
  AND ui_preferences - 'theme' - 'notebookWritingStyle' - 'notebookPageStyle' = '{}'::jsonb
  AND ui_preferences->>'theme' IN ('system', 'living', 'light', 'night', 'focus')
  AND ui_preferences->>'notebookWritingStyle' IN ('modern', 'classic', 'handwriting', 'rounded', 'minimal')
  AND ui_preferences->>'notebookPageStyle' IN ('plain', 'lined', 'grid', 'dotted')
);
