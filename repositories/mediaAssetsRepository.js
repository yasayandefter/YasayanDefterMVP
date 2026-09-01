"use strict";

const db = require("../db");
const { mapDatabaseError } = require("./errors");

function map(row) {
  return row && { id: row.id, userId: row.user_id, storageProvider: row.storage_provider, storageKey: row.storage_key, originalFilename: row.original_filename, safeFilename: row.safe_filename, mediaType: row.media_type, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), status: row.status, objectEtag: row.object_etag || null, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at, updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at, ...(row.original_status ? { cleanupOriginalStatus: row.original_status } : {}) };
}

async function usageForUser(userId, client = db) {
  try { const row = (await client.query("SELECT COUNT(*)::int asset_count,COALESCE(SUM(size_bytes),0)::bigint total_bytes FROM media_assets WHERE user_id=$1 AND status IN ('PENDING','READY','FAILED','DELETING')", [userId])).rows[0]; return { assetCount: Number(row.asset_count), totalBytes: Number(row.total_bytes) }; }
  catch (error) { throw mapDatabaseError(error, "MEDIA_USAGE_FAILED"); }
}

async function reservePending(value, limits, client = null) {
  const run = async connection => {
    const locked = await connection.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [value.userId]);
    if (!locked.rows[0]) return { asset: null, reason: "USER_NOT_FOUND" };
    const riskStates = "('PENDING','READY','FAILED','DELETING')";
    const usage = (await connection.query(`SELECT COUNT(*)::int asset_count,COALESCE(SUM(size_bytes),0)::bigint total_bytes,COUNT(*) FILTER (WHERE status IN ('PENDING','FAILED','DELETING'))::int outstanding_count,COUNT(*) FILTER (WHERE created_at>=NOW()-($2::int*INTERVAL '1 second'))::int window_count FROM media_assets WHERE user_id=$1 AND status IN ${riskStates}`, [value.userId, limits.uploadInitWindowSeconds])).rows[0];
    if (Number(usage.asset_count) >= limits.maxAssetCountPerUser || Number(usage.total_bytes) + value.sizeBytes > limits.maxTotalBytesPerUser) return { asset: null, reason: "QUOTA" };
    if (Number(usage.outstanding_count) >= limits.maxOutstandingUploadsPerUser) return { asset: null, reason: "OUTSTANDING" };
    if (Number(usage.window_count) >= limits.uploadInitLimitPerWindow) return { asset: null, reason: "INIT_RATE" };
    return createPending(value, connection);
  };
  try { return client ? await run(client) : await db.withTransaction(run); }
  catch (error) { throw mapDatabaseError(error, "MEDIA_RESERVATION_FAILED"); }
}

async function createPending(value, client = null) {
  const run = async connection => {
    const result = await connection.query(`WITH target AS (SELECT c.id FROM smart_collections c WHERE c.id=$10), owned AS (SELECT c.id FROM smart_collections c WHERE c.id=$10 AND (c.owner_user_id=$2 OR c.student_id IN (SELECT s.id FROM students s WHERE s.user_id=$2)) FOR UPDATE), capacity AS (SELECT owned.id FROM owned WHERE (SELECT COUNT(*) FROM smart_collection_items WHERE collection_id=owned.id)+(SELECT COUNT(*) FROM smart_collection_media_items WHERE collection_id=owned.id)<100), inserted AS (INSERT INTO media_assets(id,user_id,storage_provider,storage_key,original_filename,safe_filename,media_type,mime_type,size_bytes,status) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING' WHERE $10::uuid IS NULL OR EXISTS(SELECT 1 FROM capacity) RETURNING *), relation AS (INSERT INTO smart_collection_media_items(collection_id,media_asset_id) SELECT capacity.id,inserted.id FROM capacity CROSS JOIN inserted RETURNING media_asset_id) SELECT (SELECT row_to_json(inserted) FROM inserted) asset,CASE WHEN $10::uuid IS NULL OR EXISTS(SELECT 1 FROM capacity) THEN NULL WHEN NOT EXISTS(SELECT 1 FROM target) OR NOT EXISTS(SELECT 1 FROM owned) THEN 'COLLECTION_ACCESS' ELSE 'COLLECTION_CAPACITY' END reason`, [value.id, value.userId, value.storageProvider, value.storageKey, value.originalFilename, value.safeFilename, value.mediaType, value.mimeType, value.sizeBytes, value.collectionId]);
    return { asset: map(result.rows[0]?.asset), reason: result.rows[0]?.reason || null };
  };
  try { return client ? await run(client) : await db.withTransaction(run); }
  catch (error) { throw mapDatabaseError(error, "MEDIA_CREATE_FAILED"); }
}

async function findOwned(id, userId, client = db) {
  try { const row = (await client.query("WITH target AS (SELECT id FROM media_assets WHERE id=$1),owned AS (SELECT * FROM media_assets WHERE id=$1 AND user_id=$2) SELECT EXISTS(SELECT 1 FROM target) exists,(SELECT row_to_json(owned) FROM owned) asset", [id, userId])).rows[0] || {}; return { exists: Boolean(row.exists), asset: map(row.asset) }; }
  catch (error) { throw mapDatabaseError(error, "MEDIA_FIND_FAILED"); }
}

async function updateStatus(id, userId, status, extra = {}, client = db) {
  try { const row = (await client.query("UPDATE media_assets SET status=$3,object_etag=COALESCE($4,object_etag),updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *", [id, userId, status, extra.etag || null])).rows[0]; return map(row); }
  catch (error) { throw mapDatabaseError(error, "MEDIA_STATE_UPDATE_FAILED"); }
}
async function markReady(id, userId, extra, client) { return updateStatus(id, userId, "READY", extra, client); }
async function markFailed(id, userId, client) { return updateStatus(id, userId, "FAILED", {}, client); }
async function markDeleting(id, userId, client) { return updateStatus(id, userId, "DELETING", {}, client); }
async function deleteMetadata(id, userId, client = db) { try { return Boolean((await client.query("DELETE FROM media_assets WHERE id=$1 AND user_id=$2 RETURNING id", [id, userId])).rows[0]); } catch (error) { throw mapDatabaseError(error, "MEDIA_DELETE_FAILED"); } }
async function finalizeReady(id, userId, limits, extra = {}, client = null) {
  const run = async connection => {
    const locked = await connection.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!locked.rows[0]) return { asset: null, reason: "NOT_FOUND" };
    const asset = (await connection.query("SELECT * FROM media_assets WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, userId])).rows[0];
    if (!asset) return { asset: null, reason: "NOT_FOUND" };
    if (asset.status !== "PENDING") return { asset: map(asset), reason: "STATE" };
    const usage = await usageForUser(userId, connection);
    if (usage.assetCount > limits.maxAssetCountPerUser || usage.totalBytes > limits.maxTotalBytesPerUser) return { asset: map(asset), reason: "QUOTA" };
    const ready = (await connection.query("UPDATE media_assets SET status='READY',object_etag=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status='PENDING' RETURNING *", [id, userId, extra.etag || null])).rows[0];
    return ready ? { asset: map(ready), reason: null } : { asset: map(asset), reason: "STATE" };
  };
  try { return client ? await run(client) : await db.withTransaction(run); }
  catch (error) { throw mapDatabaseError(error, "MEDIA_COMPLETE_FAILED"); }
}
async function cleanupSummary(before, limit, client = db) { try { return (await client.query("SELECT status,COUNT(*)::int count FROM (SELECT status FROM media_assets WHERE status IN ('PENDING','FAILED','DELETING') AND created_at<$1 ORDER BY updated_at,id LIMIT $2) candidates GROUP BY status ORDER BY status", [before, limit])).rows.map(row => ({ status: row.status, count: Number(row.count) })); } catch (error) { throw mapDatabaseError(error, "MEDIA_CLEANUP_SUMMARY_FAILED"); } }
async function claimCleanupCandidates(before, retryBefore, limit, client = null) {
  const run = async connection => (await connection.query(`WITH candidates AS (SELECT id,status original_status FROM media_assets WHERE created_at<$1 AND ((status IN ('PENDING','FAILED')) OR (status='DELETING' AND updated_at<$2)) ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT $3),claimed AS (UPDATE media_assets m SET status='DELETING',updated_at=NOW() FROM candidates c WHERE m.id=c.id RETURNING m.*,c.original_status) SELECT * FROM claimed ORDER BY updated_at,id`, [before, retryBefore, limit])).rows.map(map);
  try { return client ? await run(client) : await db.withTransaction(run); } catch (error) { throw mapDatabaseError(error, "MEDIA_CLEANUP_CLAIM_FAILED"); }
}

module.exports = { name: "mediaAssets", map, usageForUser, createPending, reservePending, findOwned, updateStatus, markReady, markFailed, markDeleting, deleteMetadata, finalizeReady, cleanupSummary, claimCleanupCandidates };
