CREATE TABLE IF NOT EXISTS notebook_backgrounds (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  image_data BYTEA NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 921600),
  position TEXT NOT NULL DEFAULT 'center' CHECK (position IN ('center', 'top', 'bottom')),
  overlay SMALLINT NOT NULL DEFAULT 35 CHECK (overlay BETWEEN 0 AND 70),
  blur SMALLINT NOT NULL DEFAULT 0 CHECK (blur BETWEEN 0 AND 12),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notebook_background_size_matches CHECK (octet_length(image_data) = byte_size)
);
