"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const media = require("../assets/js/collection-media.js");
const collections = require("../repositories/smartCollectionsRepository");

function file(name, type, size) { return { name, type, size }; }

for (const [type, expected] of [
  ["application/pdf", "PDF"], ["image/png", "IMAGE"], ["audio/mpeg", "AUDIO"], ["video/mp4", "VIDEO"]
]) {
  const result = media.validateFile(file("fixture", type, 1024));
  assert.equal(result.ok, true); assert.equal(result.mediaType, expected);
}
assert.equal(media.validateFile(null).state, "selecting");
assert.equal(media.validateFile(file("empty.pdf", "application/pdf", 0)).code, "INVALID_MEDIA_SIZE");
assert.equal(media.validateFile(file("bad.exe", "application/octet-stream", 12)).state, "unsupported-file");
assert.equal(media.validateFile(file("large.png", "image/png", 10 * 1024 * 1024 + 1)).state, "file-too-large");
assert.equal(media.errorState("MEDIA_QUOTA_EXCEEDED"), "quota-exceeded");
assert.equal(media.errorState("UNAUTHENTICATED"), "auth-expired");
assert.equal(media.errorState("MEDIA_STORAGE_DISABLED"), "storage-unavailable");
assert.equal(media.stateMessage("quota-exceeded"), "Medya alanın dolu. Yeni dosya eklemek için mevcut medyalardan birini sil.");
assert.equal(media.stateMessage("auth-expired"), "Oturumun sona erdi. Devam etmek için yeniden giriş yap.");
assert.match(media.stateMessage("storage-unavailable"), /şu anda kullanılamıyor/);
assert.ok(media.STATES.includes("verifying") && media.STATES.includes("retry"));
const migration016 = fs.readFileSync("db/migrations/016_b2_media_provider.sql", "utf8");
assert.match(migration016, /DROP CONSTRAINT IF EXISTS media_assets_provider_check/);
assert.match(migration016, /CHECK \(storage_provider IN \('r2', 'b2'\)\)/);

const calls = [];
const states = [];
let attempt = 0;
let failPut = true;
const request = async (path, options = {}) => {
  calls.push({ path, method: options.method || "GET", body: options.body || null });
  if (path === "/api/media/uploads") {
    attempt += 1;
    return { asset: { id: `10000000-0000-4000-8000-00000000000${attempt}` }, upload: { url: `https://signed.invalid/attempt-${attempt}`, method: "PUT", headers: { "Content-Type": "application/pdf" }, expiresInSeconds: 600 } };
  }
  if (path.endsWith("/complete")) return { asset: { id: path.split("/")[3], status: "READY" } };
  if (options.method === "DELETE") return { deleted: true };
  throw new Error("UNEXPECTED_REQUEST");
};
function xhrFactory() {
  return {
    upload: {}, headers: {}, status: 0, withCredentials: true,
    open(method, url) { this.method = method; this.url = url; },
    setRequestHeader(name, value) { this.headers[name] = value; },
    send() {
      this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
      this.status = failPut ? 500 : 200;
      this.onload();
    }
  };
}

(async () => {
  const controller = media.createController({ request, xhrFactory, onState: state => states.push(state), onChanged: () => calls.push({ path: "changed" }) });
  let result = await controller.upload(file("plan.pdf", "application/pdf", 2048), "20000000-0000-4000-8000-000000000001");
  assert.equal(result.state, "error"); assert.equal(controller.getAttemptId(), "10000000-0000-4000-8000-000000000001");
  failPut = false;
  result = await controller.retry();
  assert.equal(result.state, "success"); assert.equal(attempt, 2);
  assert.ok(calls.some(call => call.method === "DELETE" && call.path.endsWith("000000000001")));
  assert.ok(calls.some(call => call.path.endsWith("000000000002/complete")));
  assert.ok(states.some(state => state.state === "progress" && state.progress === 50));
  assert.ok(states.some(state => state.state === "progress" && state.message === "Yükleniyor · %50"));
  assert.ok(states.some(state => state.state === "verifying" && state.message === "Dosya kontrol ediliyor"));
  assert.equal(JSON.stringify(controller.getState()).includes("signed.invalid"), false);

  const quota = media.createController({ request: async () => { const error = new Error("Kota dolu"); error.code = "MEDIA_QUOTA_EXCEEDED"; throw error; }, xhrFactory });
  assert.equal((await quota.upload(file("plan.pdf", "application/pdf", 10), "collection")).state, "quota-exceeded");
  const expired = media.createController({ request: async () => { const error = new Error("Oturum gerekli"); error.code = "UNAUTHENTICATED"; throw error; }, xhrFactory });
  assert.equal((await expired.upload(file("plan.pdf", "application/pdf", 10), "collection")).state, "auth-expired");

  const collectionRow = { id: "collection", name: "Archive", record_count: 2, media_count: 3, item_count: 5, created_at: new Date(), updated_at: new Date() };
  const listClient = { calls: [], async query(text, values) { this.calls.push({ text, values }); return { rows: [collectionRow] }; } };
  const listed = await collections.list({ kind: "user", id: "user-1" }, { sort: "count" }, listClient);
  assert.deepEqual({ recordCount: listed[0].recordCount, mediaCount: listed[0].mediaCount, itemCount: listed[0].itemCount }, { recordCount: 2, mediaCount: 3, itemCount: 5 });
  assert.match(listClient.calls[0].text, /item_count DESC/); assert.match(listClient.calls[0].text, /smart_collection_media_items/);
  const addClient = { calls: [], async query(text, values) { this.calls.push({ text, values }); return { rows: [{ owned_count: 1, candidate_count: 1, added_count: 1, collection_exists: true, capacity_ok: true }] }; } };
  const added = await collections.addMedia("collection", { kind: "user", id: "user-1" }, "user-1", ["10000000-0000-4000-8000-000000000001"], addClient);
  assert.equal(added.added_count, 1); assert.match(addClient.calls[0].text, /status='READY'/); assert.match(addClient.calls[0].text, /FOR UPDATE/); assert.match(addClient.calls[0].text, /smart_collection_items.*smart_collection_media_items/s);
  const removeClient = { async query(text) { assert.match(text, /DELETE FROM smart_collection_media_items/); return { rows: [{ exists: true, owned: true, asset_exists: true, asset_owned: true, removed: true }] }; } };
  assert.equal((await collections.removeMedia("collection", "asset", { kind: "user", id: "user-1" }, "user-1", removeClient)).removed, true);
  console.log("PASS  collection media policy, state machine, progress, retry reauthorization, verification, counts, READY owner attachment, combined locked capacity, removal and signed URL non-persistence");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
