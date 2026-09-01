CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_provider TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  safe_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  object_etag TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_assets_provider_check CHECK (storage_provider IN ('r2')),
  CONSTRAINT media_assets_type_check CHECK (media_type IN ('PDF','IMAGE','AUDIO','VIDEO')),
  CONSTRAINT media_assets_status_check CHECK (status IN ('PENDING','READY','FAILED','DELETING')),
  CONSTRAINT media_assets_size_check CHECK (size_bytes > 0 AND size_bytes <= 104857600),
  CONSTRAINT media_assets_original_filename_bound CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  CONSTRAINT media_assets_safe_filename_bound CHECK (char_length(safe_filename) BETWEEN 1 AND 120),
  CONSTRAINT media_assets_storage_key_bound CHECK (char_length(storage_key) BETWEEN 20 AND 512),
  CONSTRAINT media_assets_mime_type_bound CHECK (char_length(mime_type) BETWEEN 3 AND 100)
);

CREATE INDEX IF NOT EXISTS media_assets_user_status_updated_idx
  ON media_assets (user_id, status, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS media_assets_pending_cleanup_idx
  ON media_assets (updated_at, id)
  WHERE status IN ('PENDING','DELETING');

CREATE TABLE IF NOT EXISTS smart_collection_media_items (
  collection_id UUID NOT NULL REFERENCES smart_collections(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, media_asset_id),
  UNIQUE (media_asset_id)
);

CREATE INDEX IF NOT EXISTS smart_collection_media_items_asset_idx
  ON smart_collection_media_items (media_asset_id, collection_id);
