"use strict";

const assert = require("node:assert/strict");
const { createMediaService, safeFilename } = require("../services/mediaService");
const { MIME_POLICIES, getMediaConfig, publicMediaConfig } = require("../storage/mediaConfig");
const { createMockObjectStorage } = require("../storage/mockObjectStorage");

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
const records = new Map(); let usage = { assetCount: 0, totalBytes: 0 }; let collectionFailure = null;
const repository = {
  async usageForUser() { return usage; },
  async createPending(value) { if (collectionFailure) return { asset: null, reason: collectionFailure }; const asset = { ...value, status: "PENDING", createdAt: "2026-08-29T00:00:00.000Z", updatedAt: "2026-08-29T00:00:00.000Z" }; records.set(value.id, asset); return { asset }; },
  async findOwned(id, userId) { const asset = records.get(id); return { exists: Boolean(asset), asset: asset?.userId === userId ? asset : null }; },
  async markReady(id, userId, extra) { const asset = records.get(id); Object.assign(asset, { status: "READY", objectEtag: extra.etag }); return asset; },
  async markFailed(id) { const asset = records.get(id); if (asset) asset.status = "FAILED"; return asset; },
  async markDeleting(id) { const asset = records.get(id); asset.status = "DELETING"; return asset; },
  async deleteMetadata(id) { return records.delete(id); }
};
const config = { configured: true, errorCode: null, provider: "r2", uploadTtlSeconds: 600, readTtlSeconds: 600, maxTotalBytesPerUser: 1024 * 1024, maxAssetCountPerUser: 3, mimePolicies: MIME_POLICIES };
let uuidIndex = 0; const storage = createMockObjectStorage();
const service = createMediaService({ repository, objectStorage: storage, config, randomUUID: () => ids[uuidIndex++] });
const user = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "USER" };

(async () => {
  assert.equal(getMediaConfig({}).configured, false); assert.equal(getMediaConfig({ MEDIA_STORAGE_PROVIDER: "r2" }).errorCode, "MEDIA_STORAGE_CONFIG_INCOMPLETE");
  const secretConfig = { MEDIA_STORAGE_PROVIDER: "r2", R2_ACCOUNT_ID: "account", R2_ACCESS_KEY_ID: "access-secret", R2_SECRET_ACCESS_KEY: "private-secret", R2_BUCKET_NAME: "private-bucket" };
  assert.equal(getMediaConfig(secretConfig).configured, true); assert.equal(JSON.stringify(publicMediaConfig(secretConfig)).includes("secret"), false);
  assert.equal(getMediaConfig({ ...secretConfig, MEDIA_UPLOAD_URL_TTL_SECONDS: "invalid" }).errorCode, "MEDIA_STORAGE_CONFIG_INVALID");
  assert.equal(getMediaConfig({ ...secretConfig, MEDIA_MAX_TOTAL_BYTES_PER_USER: "1" }).configured, false);
  assert.equal(safeFilename("../../gizli/../sunum.pdf"), "sunum.pdf");
  assert.equal(safeFilename("..\\..\\resim<script>.png"), "resim-script-.png");
  await assert.rejects(service.requestUpload(null, {}), error => error.code === "UNAUTHENTICATED");
  await assert.rejects(service.requestUpload(user, { filename: "x.exe", mimeType: "application/octet-stream", sizeBytes: 10 }), error => error.code === "UNSUPPORTED_MEDIA_TYPE");
  await assert.rejects(service.requestUpload(user, { filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 25 * 1024 * 1024 + 1 }), error => error.code === "MEDIA_TOO_LARGE");
  await assert.rejects(service.requestUpload(user, { filename: "x.pdf", mimeType: "application/pdf", mediaType: "VIDEO", sizeBytes: 10 }), error => error.code === "MEDIA_TYPE_MISMATCH");
  await assert.rejects(service.requestUpload(user, { filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 10, userId: user.userId }), error => error.code === "INVALID_MEDIA_REQUEST");

  const requested = await service.requestUpload(user, { filename: "../../Pilot Sunum.pdf", mimeType: "application/pdf", mediaType: "PDF", sizeBytes: 2048 });
  assert.equal(requested.asset.id, ids[0]); assert.equal(requested.asset.safeFilename, "Pilot Sunum.pdf"); assert.equal(requested.asset.status, "PENDING");
  assert.match(records.get(ids[0]).storageKey, /^users\/[0-9a-f]{24}\/media\/11111111-1111-4111-8111-111111111111\/Pilot Sunum\.pdf$/);
  assert.equal(JSON.stringify(records.get(ids[0])).includes("signature="), false);
  assert.equal(JSON.stringify(requested).includes("R2_SECRET"), false);
  await assert.rejects(service.createReadAuthorization({ userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, ids[0]), error => error.code === "FORBIDDEN");
  await assert.rejects(service.deleteAsset({ userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, ids[0]), error => error.code === "FORBIDDEN");
  await assert.rejects(service.completeUpload(user, ids[0]), error => error.code === "MEDIA_OBJECT_MISSING");
  storage.objects.set(records.get(ids[0]).storageKey, { sizeBytes: 999, mimeType: "application/pdf" });
  await assert.rejects(service.completeUpload(user, ids[0]), error => error.code === "MEDIA_OBJECT_MISMATCH");

  const second = await service.requestUpload(user, { filename: "foto.webp", mimeType: "image/webp", sizeBytes: 4096 });
  storage.objects.set(records.get(second.asset.id).storageKey, { sizeBytes: 4096, mimeType: "image/webp", etag: "etag-1" });
  const ready = await service.completeUpload(user, second.asset.id); assert.equal(ready.status, "READY");
  const access = await service.createReadAuthorization(user, second.asset.id); assert.equal(access.access.method, "GET"); assert.equal(JSON.stringify(records.get(second.asset.id)).includes(access.access.url), false);

  usage = { assetCount: 3, totalBytes: 100 };
  await assert.rejects(service.requestUpload(user, { filename: "x.png", mimeType: "image/png", sizeBytes: 100 }), error => error.code === "MEDIA_QUOTA_EXCEEDED");
  usage = { assetCount: 0, totalBytes: config.maxTotalBytesPerUser - 10 };
  await assert.rejects(service.requestUpload(user, { filename: "x.png", mimeType: "image/png", sizeBytes: 100 }), error => error.code === "MEDIA_QUOTA_EXCEEDED");
  usage = { assetCount: 0, totalBytes: 0 }; collectionFailure = "COLLECTION_CAPACITY";
  await assert.rejects(service.requestUpload(user, { filename: "x.png", mimeType: "image/png", sizeBytes: 100, collectionId: ids[3] }), error => error.code === "COLLECTION_CAPACITY_EXCEEDED"); collectionFailure = null;

  const failedStorage = createMockObjectStorage({ failDelete: true });
  const failedDeleteService = createMediaService({ repository, objectStorage: failedStorage, config });
  await assert.rejects(failedDeleteService.deleteAsset(user, second.asset.id), error => error.code === "MEDIA_DELETE_RETRY_REQUIRED");
  assert.equal(records.get(second.asset.id).status, "DELETING");
  const deletion = await service.deleteAsset(user, second.asset.id); assert.equal(deletion.deleted, true); assert.equal(records.has(second.asset.id), false);
  console.log("PASS  media validation, quota, owner-scoped keys, lifecycle verification, private reads, deletion retry and signed URL non-persistence");
})().catch(error => { console.error(error); process.exitCode = 1; });
