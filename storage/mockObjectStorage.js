"use strict";

function createMockObjectStorage(options = {}) {
  const objects = new Map(Object.entries(options.objects || {}));
  const calls = [];
  let remainingDeleteFailures = Number(options.failDeleteCount || (options.failDelete ? Number.MAX_SAFE_INTEGER : 0));
  const base = "https://mock-r2.invalid";
  return {
    provider: "mock",
    available: true,
    objects,
    calls,
    async createUploadAuthorization({ key, mimeType, sizeBytes }) { calls.push({ operation: "PUT", key, mimeType, sizeBytes }); return { url: `${base}/put/${encodeURIComponent(key)}?signature=secret`, method: "PUT", headers: { "Content-Type": mimeType }, signedHeaders: ["content-length", "content-type"], expectedSizeBytes: sizeBytes, expiresInSeconds: 600 }; },
    async simulateUpload({ key, mimeType, sizeBytes, authorization }) { calls.push({ operation: "SIMULATE_PUT", key, mimeType, sizeBytes }); if (sizeBytes !== authorization.expectedSizeBytes) { const error = new Error("MOCK_CONTENT_LENGTH_MISMATCH"); error.code = "MOCK_CONTENT_LENGTH_MISMATCH"; throw error; } if (mimeType !== authorization.headers["Content-Type"]) { const error = new Error("MOCK_CONTENT_TYPE_MISMATCH"); error.code = "MOCK_CONTENT_TYPE_MISMATCH"; throw error; } objects.set(key, { sizeBytes, mimeType, etag: options.etag || "mock-etag" }); return { stored: true }; },
    async createReadAuthorization({ key }) { calls.push({ operation: "GET", key }); return { url: `${base}/get/${encodeURIComponent(key)}?signature=secret`, method: "GET", expiresInSeconds: 600 }; },
    async headObject({ key }) { calls.push({ operation: "HEAD", key }); return objects.has(key) ? { exists: true, ...objects.get(key) } : { exists: false }; },
    async deleteObject({ key }) { calls.push({ operation: "DELETE", key }); if (remainingDeleteFailures > 0) { remainingDeleteFailures -= 1; throw new Error("MOCK_DELETE_FAILED"); } objects.delete(key); return { deleted: true }; }
  };
}

module.exports = { createMockObjectStorage };
