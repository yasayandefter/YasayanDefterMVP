"use strict";

const assert = require("node:assert/strict");
const media = require("../repositories/mediaAssetsRepository");

function client(rows) { const calls = []; return { calls, async query(text, values) { calls.push({ text, values }); return { rows: typeof rows === "function" ? rows(text) : rows }; } }; }

(async () => {
  const usageClient = client([{ asset_count: 2, total_bytes: "4096" }]);
  assert.deepEqual(await media.usageForUser("user-1", usageClient), { assetCount: 2, totalBytes: 4096 });
  assert.match(usageClient.calls[0].text, /user_id=\$1/); assert.match(usageClient.calls[0].text, /PENDING.*READY.*DELETING/);
  const row = { id: "asset", user_id: "user-1", storage_provider: "r2", storage_key: "users/hash/media/id/file.pdf", original_filename: "file.pdf", safe_filename: "file.pdf", media_type: "PDF", mime_type: "application/pdf", size_bytes: "42", status: "PENDING", created_at: new Date("2026-08-29T00:00:00Z"), updated_at: new Date("2026-08-29T00:00:00Z") };
  const createClient = client([{ asset: row, reason: null }]);
  const created = await media.createPending({ id: "asset", userId: "user-1", storageProvider: "r2", storageKey: row.storage_key, originalFilename: "file.pdf", safeFilename: "file.pdf", mediaType: "PDF", mimeType: "application/pdf", sizeBytes: 42, collectionId: null }, createClient);
  assert.equal(created.asset.userId, "user-1"); assert.equal(created.asset.sizeBytes, 42);
  assert.match(createClient.calls[0].text, /smart_collection_media_items/); assert.match(createClient.calls[0].text, /smart_collection_items/); assert.match(createClient.calls[0].text, /<100/); assert.equal(createClient.calls[0].values.includes("user-1"), true);
  const findClient = client([{ exists: true, asset: row }]); assert.equal((await media.findOwned("asset", "user-1", findClient)).asset.storageKey, row.storage_key); assert.deepEqual(findClient.calls[0].values, ["asset", "user-1"]);
  const cleanupClient = client([row]); assert.equal((await media.listCleanupCandidates(new Date(), cleanupClient)).length, 1); assert.match(cleanupClient.calls[0].text, /status='PENDING'.*status='DELETING'/);
  console.log("PASS  media repository parameterization, ownership, quota accounting, combined collection capacity and cleanup candidates");
})().catch(error => { console.error(error); process.exitCode = 1; });
