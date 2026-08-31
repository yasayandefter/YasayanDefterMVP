"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { getMediaConfig } = require("../storage/mediaConfig");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mediaError(code, status = 400) { const error = new Error(code); error.code = code; error.status = status; return error; }
function requireUser(auth) { if (!auth?.userId) throw mediaError("UNAUTHENTICATED", 401); return auth.userId; }
function safeFilename(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 255) throw mediaError("INVALID_MEDIA_REQUEST");
  const base = path.posix.basename(value.normalize("NFKC").replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/^\.+/, "").replace(/\s+/g, " ").trim();
  const bounded = base.slice(0, 120).replace(/[. ]+$/g, "");
  return bounded || "media-file";
}
function uuid(value, optional = false) { if (optional && (value === undefined || value === null || value === "")) return null; if (typeof value !== "string" || !UUID.test(value)) throw mediaError("INVALID_MEDIA_REQUEST"); return value; }
function publicAsset(asset) { return asset && { id: asset.id, originalFilename: asset.originalFilename, safeFilename: asset.safeFilename, mediaType: asset.mediaType, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, status: asset.status, createdAt: asset.createdAt, updatedAt: asset.updatedAt }; }
function storageKey(userId, assetId, filename) { const owner = crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 24); return `users/${owner}/media/${assetId}/${filename}`; }

function validateUploadInput(input, config) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw mediaError("INVALID_MEDIA_REQUEST");
  const allowed = new Set(["filename", "mimeType", "sizeBytes", "mediaType", "collectionId"]);
  if (Object.keys(input).some(key => !allowed.has(key))) throw mediaError("INVALID_MEDIA_REQUEST");
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.trim().toLowerCase() : "";
  const policy = config.mimePolicies[mimeType];
  if (!policy) throw mediaError("UNSUPPORTED_MEDIA_TYPE", 415);
  if (input.mediaType !== undefined && String(input.mediaType).toUpperCase() !== policy.mediaType) throw mediaError("MEDIA_TYPE_MISMATCH");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) throw mediaError("INVALID_MEDIA_SIZE");
  if (input.sizeBytes > policy.maxBytes) throw mediaError("MEDIA_TOO_LARGE", 413);
  return { originalFilename: input.filename, safeFilename: safeFilename(input.filename), mimeType, mediaType: policy.mediaType, sizeBytes: input.sizeBytes, collectionId: uuid(input.collectionId, true) };
}

function createMediaService(options) {
  const repository = options.repository;
  const objectStorage = options.objectStorage;
  const config = options.config || getMediaConfig();
  const randomUUID = options.randomUUID || crypto.randomUUID;
  if (!repository) throw new Error("MEDIA_REPOSITORY_REQUIRED");
  if (!objectStorage) throw new Error("OBJECT_STORAGE_REQUIRED");

  return Object.freeze({
    async requestUpload(auth, input) {
      const userId = requireUser(auth);
      if (!config.configured || !objectStorage.available) throw mediaError(config.errorCode || "MEDIA_STORAGE_UNAVAILABLE", 503);
      const value = validateUploadInput(input, config);
      const usage = await repository.usageForUser(userId);
      if (usage.assetCount >= config.maxAssetCountPerUser || usage.totalBytes + value.sizeBytes > config.maxTotalBytesPerUser) throw mediaError("MEDIA_QUOTA_EXCEEDED", 409);
      const id = randomUUID();
      const key = storageKey(userId, id, value.safeFilename);
      const result = await repository.createPending({ id, userId, storageProvider: config.provider, storageKey: key, ...value });
      if (!result.asset) throw mediaError(result.reason === "COLLECTION_CAPACITY" ? "COLLECTION_CAPACITY_EXCEEDED" : "COLLECTION_ACCESS_DENIED", 403);
      try {
        const upload = await objectStorage.createUploadAuthorization({ key, mimeType: value.mimeType, sizeBytes: value.sizeBytes });
        return { asset: publicAsset(result.asset), upload };
      } catch (error) {
        await repository.markFailed(id, userId).catch(() => {});
        throw mediaError("MEDIA_STORAGE_UNAVAILABLE", 503);
      }
    },
    async completeUpload(auth, id, input = {}) {
      const userId = requireUser(auth); uuid(id);
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw mediaError("INVALID_MEDIA_REQUEST");
      const found = await repository.findOwned(id, userId);
      if (!found.exists) throw mediaError("MEDIA_NOT_FOUND", 404);
      if (!found.asset) throw mediaError("FORBIDDEN", 403);
      if (found.asset.status !== "PENDING") throw mediaError("MEDIA_STATE_INVALID", 409);
      const head = await objectStorage.headObject({ key: found.asset.storageKey });
      if (!head.exists) throw mediaError("MEDIA_OBJECT_MISSING", 409);
      if (head.sizeBytes !== found.asset.sizeBytes || String(head.mimeType || "").toLowerCase() !== found.asset.mimeType) { await repository.markFailed(id, userId); throw mediaError("MEDIA_OBJECT_MISMATCH", 409); }
      return publicAsset(await repository.markReady(id, userId, { etag: head.etag || null }));
    },
    async createReadAuthorization(auth, id) {
      const userId = requireUser(auth); uuid(id);
      const found = await repository.findOwned(id, userId);
      if (!found.exists) throw mediaError("MEDIA_NOT_FOUND", 404);
      if (!found.asset) throw mediaError("FORBIDDEN", 403);
      if (found.asset.status !== "READY") throw mediaError("MEDIA_NOT_READY", 409);
      const access = await objectStorage.createReadAuthorization({ key: found.asset.storageKey });
      return { asset: publicAsset(found.asset), access };
    },
    async deleteAsset(auth, id) {
      const userId = requireUser(auth); uuid(id);
      const found = await repository.findOwned(id, userId);
      if (!found.exists) throw mediaError("MEDIA_NOT_FOUND", 404);
      if (!found.asset) throw mediaError("FORBIDDEN", 403);
      if (!["READY", "FAILED", "DELETING", "PENDING"].includes(found.asset.status)) throw mediaError("MEDIA_STATE_INVALID", 409);
      const deleting = await repository.markDeleting(id, userId);
      try { await objectStorage.deleteObject({ key: deleting.storageKey }); }
      catch (_) { throw mediaError("MEDIA_DELETE_RETRY_REQUIRED", 503); }
      await repository.deleteMetadata(id, userId);
      return { deleted: true, id };
    }
  });
}

module.exports = { UUID, createMediaService, mediaError, publicAsset, safeFilename, storageKey, validateUploadInput };
