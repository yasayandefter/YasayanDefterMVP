# Yaşayan Defter 15.7 media storage foundation

## Boundary and data placement

Media binaries live only in a private Cloudflare R2 Standard bucket. Neon PostgreSQL stores `media_assets` metadata, ownership, lifecycle state, an opaque object key, and the optional normalized collection relation. Browser code never receives R2 credentials or a public bucket URL. Application code calls the object-storage boundary (`createUploadAuthorization`, `createReadAuthorization`, `headObject`, `deleteObject`) instead of Cloudflare APIs directly.

The Node/Vercel function accepts small JSON metadata requests only; its existing 1 MB JSON limit is unchanged. File bodies go directly from the browser to a single-object, short-lived presigned R2 PUT URL. Reads use an on-demand presigned GET URL after ownership checks. Signed URLs are bearer credentials: they are neither logged nor persisted.

## Lifecycles

Upload: authenticate → validate allowlisted MIME, category, size, filename and optional collection → check quota → create `PENDING` metadata → issue a 10-minute PUT authorization bound to the object key and content type → direct browser upload → completion request → R2 HEAD verification of presence, size and MIME → `READY`. A record is never marked ready before verification.

Read: authenticate → load by ID and enforce `user_id` ownership → require `READY` → issue a 10-minute GET authorization for exactly that key. PostgreSQL stores only the key.

Delete: authenticate and verify ownership → set `DELETING` → delete the R2 object → delete metadata (collection relation cascades). R2 delete is idempotent. A storage failure leaves `DELETING`, and the same delete call can safely retry. No other user's key is accepted from the client.

## Validation, keys, quota, and Collections

Supported MIME categories are centralized in `storage/mediaConfig.js`: PDF (`application/pdf`, 25 MB); JPEG/PNG/WebP images (10 MB); MPEG/MP4/WAV/Ogg audio (50 MB); MP4/WebM video (100 MB). Filename extension is not trusted. Completion compares R2 metadata to the signed declaration; a future content-inspection worker may add magic-byte checks where needed.

Keys are generated server-side as `users/{sha256-owner-prefix}/media/{uuid}/{sanitized-filename}`. Raw paths, client keys, and client user IDs are rejected. The UUID prevents collisions, the non-reversible owner prefix scopes objects, and filenames are normalized and stripped of traversal/control characters.

Quota checks occur before authorization. Defaults are configurable through `MEDIA_MAX_TOTAL_BYTES_PER_USER` (1 GiB) and `MEDIA_MAX_ASSET_COUNT_PER_USER` (500). `PENDING`, `READY`, and `DELETING` allocations count toward quota.

`smart_collection_media_items` is separate from the existing note-only `smart_collection_items`, preserving all current CRUD and suggestion semantics. Repository transactions lock the owned collection and enforce the existing combined 100-member maximum. Phase 2 may expose ready media alongside notes in the bounded Collections workspace.

## Configuration and graceful availability

Server-only variables:

- `MEDIA_STORAGE_PROVIDER=r2`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- optional `R2_ENDPOINT`
- optional `MEDIA_UPLOAD_URL_TTL_SECONDS`, `MEDIA_READ_URL_TTL_SECONDS`
- optional `MEDIA_MAX_TOTAL_BYTES_PER_USER`, `MEDIA_MAX_ASSET_COUNT_PER_USER`

No value belongs in browser assets. Missing or partial configuration makes media capability unavailable with a safe code; the rest of Yaşayan Defter continues normally.

## R2 CORS plan

Keep the bucket private. Configure explicit allowed origins: `https://yasayan-defter-mvp.vercel.app` and individually named local development origins such as `http://127.0.0.1:3000` and `http://localhost:3000`. Do not use `*`.

Allow `PUT`, `GET`, and `HEAD`; expose only required response headers such as `ETag`; allow only required request headers, notably `Content-Type`; use a bounded preflight cache. `DELETE` remains server-to-R2 and is not a browser CORS method.

## Failure and orphan strategy

- Expired `PENDING`: a bounded scheduled/manual cleanup queries records older than the configured operational threshold, HEADs/deletes any object, then removes metadata.
- Upload succeeded but completion failed: retry completion; HEAD verification is idempotent. Expired records are handled by the same cleanup.
- DB record exists but object is missing: completion returns `MEDIA_OBJECT_MISSING`; reads never authorize non-`READY` records.
- Object exists without a DB row: a future bounded inventory reconciliation compares the private bucket prefix to database keys and deletes only objects older than a safety window.
- Failed deletion: retain `DELETING` for retry; never silently return it to `READY`.

Phase 1 provides cleanup candidate queries but deliberately does not add a background scheduler. Phase 2 integration points are the Collections media list, upload controls, progress UI, retry/cancel UX, and an operator-invoked bounded cleanup job.
