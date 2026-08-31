"use strict";

function createMockObjectStorage(options = {}) {
  const objects = new Map(Object.entries(options.objects || {}));
  const calls = [];
  const base = "https://mock-r2.invalid";
  return {
    provider: "mock",
    available: true,
    objects,
    calls,
    async createUploadAuthorization({ key, mimeType }) { calls.push({ operation: "PUT", key, mimeType }); return { url: `${base}/put/${encodeURIComponent(key)}?signature=secret`, method: "PUT", headers: { "Content-Type": mimeType }, expiresInSeconds: 600 }; },
    async createReadAuthorization({ key }) { calls.push({ operation: "GET", key }); return { url: `${base}/get/${encodeURIComponent(key)}?signature=secret`, method: "GET", expiresInSeconds: 600 }; },
    async headObject({ key }) { calls.push({ operation: "HEAD", key }); return objects.has(key) ? { exists: true, ...objects.get(key) } : { exists: false }; },
    async deleteObject({ key }) { calls.push({ operation: "DELETE", key }); if (options.failDelete) throw new Error("MOCK_DELETE_FAILED"); objects.delete(key); return { deleted: true }; }
  };
}

module.exports = { createMockObjectStorage };
