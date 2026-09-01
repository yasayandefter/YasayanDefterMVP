"use strict";

const assert = require("node:assert/strict");
const media = require("../repositories/mediaAssetsRepository");

function client(rows) { const calls = []; return { calls, async query(text, values) { calls.push({ text, values }); return { rows: typeof rows === "function" ? rows(text) : rows }; } }; }

(async () => {
  const usageClient = client([{ asset_count: 2, total_bytes: "4096" }]);
  assert.deepEqual(await media.usageForUser("user-1", usageClient), { assetCount: 2, totalBytes: 4096 });
  assert.match(usageClient.calls[0].text, /user_id=\$1/); assert.match(usageClient.calls[0].text, /PENDING.*READY.*FAILED.*DELETING/);
  const row = { id: "asset", user_id: "user-1", storage_provider: "r2", storage_key: "users/hash/media/id/file.pdf", original_filename: "file.pdf", safe_filename: "file.pdf", media_type: "PDF", mime_type: "application/pdf", size_bytes: "42", status: "PENDING", created_at: new Date("2026-08-29T00:00:00Z"), updated_at: new Date("2026-08-29T00:00:00Z") };
  const createClient = client([{ asset: row, reason: null }]);
  const created = await media.createPending({ id: "asset", userId: "user-1", storageProvider: "r2", storageKey: row.storage_key, originalFilename: "file.pdf", safeFilename: "file.pdf", mediaType: "PDF", mimeType: "application/pdf", sizeBytes: 42, collectionId: null }, createClient);
  assert.equal(created.asset.userId, "user-1"); assert.equal(created.asset.sizeBytes, 42);
  assert.match(createClient.calls[0].text, /smart_collection_media_items/); assert.match(createClient.calls[0].text, /smart_collection_items/); assert.match(createClient.calls[0].text, /<100/); assert.equal(createClient.calls[0].values.includes("user-1"), true);
  const reserveClient = client(text => text.startsWith("SELECT id FROM users") ? [{ id: "user-1" }] : text.includes("outstanding_count") ? [{ asset_count: 1, total_bytes: "40", outstanding_count: 1, window_count: 2 }] : [{ asset: row, reason: null }]);
  assert.equal((await media.reservePending({ id: "asset", userId: "user-1", storageProvider: "r2", storageKey: row.storage_key, originalFilename: "file.pdf", safeFilename: "file.pdf", mediaType: "PDF", mimeType: "application/pdf", sizeBytes: 42, collectionId: null }, { maxAssetCountPerUser: 5, maxTotalBytesPerUser: 1000, maxOutstandingUploadsPerUser: 3, uploadInitLimitPerWindow: 10, uploadInitWindowSeconds: 900 }, reserveClient)).asset.id, "asset");
  assert.match(reserveClient.calls[0].text, /FOR UPDATE/); assert.match(reserveClient.calls[1].text, /FAILED/); assert.match(reserveClient.calls[1].text, /created_at>=NOW/);
  const blockedClient = client(text => text.startsWith("SELECT id FROM users") ? [{ id: "user-1" }] : [{ asset_count: 1, total_bytes: "40", outstanding_count: 3, window_count: 3 }]);
  assert.equal((await media.reservePending({ userId: "user-1", sizeBytes: 42 }, { maxAssetCountPerUser: 5, maxTotalBytesPerUser: 1000, maxOutstandingUploadsPerUser: 3, uploadInitLimitPerWindow: 10, uploadInitWindowSeconds: 900 }, blockedClient)).reason, "OUTSTANDING");
  const findClient = client([{ exists: true, asset: row }]); assert.equal((await media.findOwned("asset", "user-1", findClient)).asset.storageKey, row.storage_key); assert.deepEqual(findClient.calls[0].values, ["asset", "user-1"]);
  const finalClient = client(text => text.startsWith("SELECT id FROM users") ? [{ id: "user-1" }] : text.startsWith("SELECT * FROM media_assets") ? [row] : text.includes("asset_count") ? [{ asset_count: 1, total_bytes: "42" }] : [{ ...row, status: "READY", object_etag: "etag" }]);
  assert.equal((await media.finalizeReady("asset", "user-1", { maxAssetCountPerUser: 5, maxTotalBytesPerUser: 1000 }, { etag: "etag" }, finalClient)).asset.status, "READY"); assert.match(finalClient.calls[0].text, /FOR UPDATE/); assert.match(finalClient.calls[1].text, /FOR UPDATE/);
  const cleanupClient = client([{ ...row, status: "DELETING", original_status: "PENDING" }]); assert.equal((await media.claimCleanupCandidates(new Date(), new Date(), 50, cleanupClient))[0].cleanupOriginalStatus, "PENDING"); assert.match(cleanupClient.calls[0].text, /FOR UPDATE SKIP LOCKED/); assert.match(cleanupClient.calls[0].text, /FAILED/);
  const summaryClient = client([{ status: "FAILED", count: 2 }]); assert.deepEqual(await media.cleanupSummary(new Date(), 50, summaryClient), [{ status: "FAILED", count: 2 }]);
  console.log("PASS  media repository locked reservation, all-state quota, completion lock, ownership, capacity and bounded cleanup claims");
})().catch(error => { console.error(error); process.exitCode = 1; });
