"use strict";

const assert = require("node:assert/strict");
const { createMediaCleanupService } = require("../services/mediaCleanupService");
const { createMockObjectStorage } = require("../storage/mockObjectStorage");
const { getMediaCleanupConfig } = require("../storage/mediaConfig");

const old = "2026-08-01T00:00:00.000Z";
function asset(id, status, original = status) { return { id, userId: "owner", storageKey: `users/hash/media/${id}/file.pdf`, status: "DELETING", cleanupOriginalStatus: original, createdAt: old, updatedAt: old }; }

(async () => {
  assert.deepEqual(getMediaCleanupConfig({}), { configured: true, errorCode: null, batchSize: 50, staleSeconds: 1800, retrySeconds: 300 });
  assert.equal(getMediaCleanupConfig({ MEDIA_CLEANUP_BATCH_SIZE: "101" }).configured, false); assert.equal(getMediaCleanupConfig({ MEDIA_CLEANUP_STALE_SECONDS: "1799" }).configured, false);
  const removed = [], claimed = [asset("pending", "DELETING", "PENDING"), asset("failed", "DELETING", "FAILED"), asset("deleting", "DELETING")];
  const repository = { async cleanupSummary(before, limit) { assert.equal(limit, 50); return [{ status: "PENDING", count: 1 }]; }, async claimCleanupCandidates(before, retryBefore, limit) { assert.equal(limit, 50); return claimed; }, async deleteMetadata(id) { removed.push(id); } };
  const storage = createMockObjectStorage({ objects: Object.fromEntries(claimed.map(item => [item.storageKey, { sizeBytes: 42, mimeType: "application/pdf" }])) });
  const authorization = await storage.createUploadAuthorization({ key: "users/hash/media/exact/file.pdf", mimeType: "application/pdf", sizeBytes: 42 }); await storage.simulateUpload({ key: "users/hash/media/exact/file.pdf", mimeType: "application/pdf", sizeBytes: 42, authorization });
  await assert.rejects(storage.simulateUpload({ key: "users/hash/media/large/file.pdf", mimeType: "application/pdf", sizeBytes: 43, authorization }), error => error.code === "MOCK_CONTENT_LENGTH_MISMATCH"); await assert.rejects(storage.simulateUpload({ key: "users/hash/media/mime/file.pdf", mimeType: "image/png", sizeBytes: 42, authorization }), error => error.code === "MOCK_CONTENT_TYPE_MISMATCH");
  const service = createMediaCleanupService({ repository, objectStorage: storage, config: getMediaCleanupConfig({}), now: () => new Date("2026-09-01T00:00:00.000Z") });
  const callsBeforeDryRun = storage.calls.length; const dry = await service.run({ dryRun: true }); assert.equal(dry.candidateCount, 1); assert.equal(storage.calls.length, callsBeforeDryRun); assert.equal(removed.length, 0);
  const result = await service.run(); assert.deepEqual({ processed: result.processed, failed: result.failed }, { processed: 3, failed: 0 }); assert.deepEqual(removed, ["pending", "failed", "deleting"]); assert.equal(storage.calls.filter(call => call.operation === "DELETE").length, 3);
  const retryStorage = createMockObjectStorage({ failDeleteCount: 1 }); const retained = [];
  const retryService = createMediaCleanupService({ repository: { async claimCleanupCandidates() { return [asset("retry", "DELETING")]; }, async deleteMetadata(id) { retained.push(id); } }, objectStorage: retryStorage, config: getMediaCleanupConfig({}) });
  assert.equal((await retryService.run()).partialFailure, true); assert.equal(retained.length, 0); assert.equal((await retryService.run()).partialFailure, false); assert.deepEqual(retained, ["retry"]);
  await retryStorage.deleteObject({ key: "missing" }); await retryStorage.deleteObject({ key: "missing" });
  console.log("PASS  bounded media cleanup dry-run, PENDING/FAILED/DELETING, absent delete, provider failure and retry");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
