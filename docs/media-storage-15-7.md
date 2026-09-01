# Yaşayan Defter 15.7 media storage foundation

## Boundary and data placement

Backblaze B2, through its S3-compatible API, is the active target provider. Media binaries live only in the private `yasayan-defter-media` bucket. Neon PostgreSQL stores `media_assets` metadata, ownership, lifecycle state, an opaque object key, and the optional normalized collection relation. Browser code never receives storage credentials or a public bucket URL. Application code calls the provider-neutral object-storage boundary (`createUploadAuthorization`, `createReadAuthorization`, `headObject`, `deleteObject`); mock, R2, and B2 adapters remain supported.

The Node/Vercel function accepts small JSON metadata requests only; its existing 1 MB JSON limit is unchanged. File bodies go directly from the browser to a single-object, short-lived presigned B2 PUT URL. Reads use an on-demand private presigned GET URL after ownership checks. Signed URLs are bearer credentials: they are neither logged nor persisted.

## Lifecycles

Upload: authenticate → validate allowlisted MIME, category, size, filename and optional collection → lock the user row → transactionally validate quota/abuse limits and reserve `PENDING` metadata → issue a 10-minute PUT authorization bound to the object key, exact `Content-Length`, and normalized `Content-Type` → direct browser upload → completion request → B2 `HeadObject` verification of presence, exact size, policy maximum, MIME and ETag → lock/recheck quota and state → `READY`. Browser code sets only `Content-Type`; the user agent supplies `Content-Length`. A record is never marked ready before authoritative verification.

Read: authenticate → load by ID and enforce `user_id` ownership → require `READY` → issue a 10-minute GET authorization for exactly that key. PostgreSQL stores only the key.

Delete: authenticate and verify ownership → set `DELETING` → server-side B2 `DeleteObject` → retain a tombstone while a recent upload authorization could still be replayed → bounded cleanup deletes the key again and removes metadata (collection relation cascades). Older assets can finalize immediately. Object deletion is idempotent. A storage failure leaves `DELETING` for retry. No other user's key is accepted from the client.

## Validation, keys, quota, and Collections

Supported MIME categories are centralized in `storage/mediaConfig.js`: PDF (`application/pdf`, 25 MB); JPEG/PNG/WebP images (10 MB); MPEG/MP4/WAV/Ogg audio (50 MB); MP4/WebM video (100 MB). Filename extension is not trusted. Completion compares B2 object metadata to the signed declaration; a future content-inspection worker may add magic-byte checks where needed.

Keys are generated server-side as `users/{sha256-owner-prefix}/media/{uuid}/{sanitized-filename}`. Raw paths, client keys, and client user IDs are rejected. The UUID prevents collisions, the non-reversible owner prefix scopes objects, and filenames are normalized and stripped of traversal/control characters.

Quota reservation and `PENDING` creation share one PostgreSQL transaction. The authenticated `users` row is locked before usage is aggregated; the optional collection is locked second. This serializes same-user initializations while different users remain independent. Defaults are configurable through `MEDIA_MAX_TOTAL_BYTES_PER_USER` (1 GiB) and `MEDIA_MAX_ASSET_COUNT_PER_USER` (500). `PENDING`, `READY`, `FAILED`, and `DELETING` allocations count until metadata is proven object-free and removed.

Abuse controls are database-backed under the same user lock: `MEDIA_MAX_OUTSTANDING_UPLOADS_PER_USER` defaults to 3, while `MEDIA_UPLOAD_INIT_LIMIT_PER_WINDOW` defaults to 10 within `MEDIA_UPLOAD_INIT_WINDOW_SECONDS` (900). Invalid overrides make media configuration unavailable with a sanitized code.

`smart_collection_media_items` is separate from the existing note-only `smart_collection_items`, preserving all current CRUD and suggestion semantics. Repository transactions lock the owned collection and enforce the existing combined 100-member maximum.

## Configuration and graceful availability

Active B2 server-only variables:

- `MEDIA_STORAGE_PROVIDER=b2`
- `B2_ENDPOINT` (expected `https://s3.eu-central-003.backblazeb2.com`)
- `B2_REGION` (expected `eu-central-003`)
- `B2_BUCKET_NAME` (expected `yasayan-defter-media`)
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`
- optional `MEDIA_UPLOAD_URL_TTL_SECONDS`, `MEDIA_READ_URL_TTL_SECONDS` (defaults: 600 seconds)
- optional `MEDIA_MAX_TOTAL_BYTES_PER_USER`, `MEDIA_MAX_ASSET_COUNT_PER_USER`
- optional `MEDIA_MAX_OUTSTANDING_UPLOADS_PER_USER` (default 3)
- optional `MEDIA_UPLOAD_INIT_LIMIT_PER_WINDOW` (default 10) and `MEDIA_UPLOAD_INIT_WINDOW_SECONDS` (default 900)
- optional cleanup bounds: `MEDIA_CLEANUP_BATCH_SIZE` (default 50, maximum 100) and `MEDIA_CLEANUP_STALE_SECONDS` (default/minimum 1800)

The R2 adapter remains available with its existing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and optional `R2_ENDPOINT` contract when `MEDIA_STORAGE_PROVIDER=r2`. Local/provider-isolated tests may use `MEDIA_STORAGE_PROVIDER=mock`.

No credential value belongs in browser assets, responses, logs, documentation, or source control. Missing, partial, or malformed configuration makes media capability unavailable with a sanitized error code; the rest of Yaşayan Defter continues normally.

## Backblaze CORS (already configured manually)

The `yasayan-defter-web` rule keeps the bucket private and explicitly allows `https://yasayan-defter-mvp.vercel.app`, `http://127.0.0.1:3000`, and `http://localhost:3000`. It does not use a wildcard origin. Application code must not modify this rule.

Allowed operations are `s3_put`, `s3_get`, and `s3_head`; allowed headers are `*`; exposed headers are `etag`, `content-length`, and `content-type`; max age is 3600 seconds. `DELETE` remains server-to-B2 and is not a browser CORS operation.

## Failure and orphan strategy

- Expired `PENDING` and `FAILED`: the cleanup command atomically claims a bounded indexed database batch, transitions candidates to `DELETING`, deletes their exact keys, and removes metadata only beyond the replay-safe age.
- Upload succeeded but completion failed: retry completion; HEAD verification is idempotent. Expired records are handled by the same cleanup.
- DB record exists but object is missing: completion returns `MEDIA_OBJECT_MISSING`; reads never authorize non-`READY` records.
- Object exists without a DB row: a future bounded inventory reconciliation compares the private bucket prefix to database keys and deletes only objects older than a safety window.
- Verification mismatch: transition to `DELETING`, immediately attempt deletion, and retain a tombstone until the PUT authorization plus safety margin has expired.
- Failed deletion: retain `DELETING` for retry; never silently return it to `READY`.

Run `npm run media:cleanup -- --dry-run` for a read-only aggregate preview or `npm run media:cleanup` for exactly one bounded batch. Dry-run performs no storage calls or writes. Logs contain status counts only—never filenames, keys, owners, URLs, or credentials. Exit codes are 0 for success, 1 for partial provider failure, and 2 for configuration/database preflight failure. No public cleanup endpoint, ordinary-request cleanup, endless loop, or bucket-wide listing exists.

Historical object-without-metadata reconciliation, magic-byte inspection, checksum binding, and persistent download rate limiting remain documented operational debt. Production GO still requires a controlled real-B2 browser test proving exact-length PUT success and altered-length rejection; unit tests alone do not establish B2 compatibility.

## Local validation

Run `npm run test:media` without credentials for config, signing, HEAD mapping, delete, provider selection, and security coverage through mocked AWS SDK v3 dependencies. Real connectivity is opt-in only: configure the B2 variable names above in the local process environment, use a unique isolated test prefix and non-sensitive tiny object, then PUT, HEAD, optionally GET, DELETE, and verify cleanup. Never use a real user object or print variables.

## Production status

Migration `015_media_storage_foundation.sql` exists but is not applied to production in this phase. There is no deployment, release, public-bucket change, or production Neon mutation. Future environment setup must keep B2 credentials server-only and separately scoped per environment; no `NEXT_PUBLIC_`, browser, or client-exposed variable is permitted.
