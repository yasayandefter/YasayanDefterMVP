"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const { getMediaConfig } = require("../storage/mediaConfig");
const { createMockObjectStorage } = require("../storage/mockObjectStorage");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  media PostgreSQL: TEST_DATABASE_URL missing"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");
const port = 52000 + crypto.randomInt(1000); const base = `http://127.0.0.1:${port}`;
Object.assign(process.env, { ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" });
const app = require("../server");
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
const storage = createMockObjectStorage();
const mediaConfig = getMediaConfig({ MEDIA_STORAGE_PROVIDER: "r2", R2_ACCOUNT_ID: "test-account", R2_ACCESS_KEY_ID: "test-access", R2_SECRET_ACCESS_KEY: "test-secret", R2_BUCKET_NAME: "private-test", MEDIA_MAX_ASSET_COUNT_PER_USER: "1", MEDIA_MAX_TOTAL_BYTES_PER_USER: String(100 * 1024 * 1024) });
app.locals.mediaConfigFactory = () => mediaConfig; app.locals.mediaStorageFactory = () => storage;
let server; const suffix = crypto.randomBytes(5).toString("hex"); const usernames = [`media_u_${suffix}`, `media_o_${suffix}`];
async function call(path, method = "GET", body, cookie) { const response = await fetch(base + path, { method, headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { Origin: base } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { response, body: await response.json().catch(() => ({})) }; }

(async () => {
  const migration = await pool.query("SELECT to_regclass('public.media_assets') media,to_regclass('public.smart_collection_media_items') relation");
  assert.ok(migration.rows[0].media && migration.rows[0].relation, "015 migration must be applied to TEST database");
  server = app.listen(port);
  const sessions = []; const users = [];
  for (const username of usernames) { const result = await call("/api/auth/register", "POST", { username, password: "Media-Foundation-15.7!" }); assert.equal(result.response.status, 201); sessions.push(String(result.response.headers.get("set-cookie")).split(";")[0]); users.push(result.body.user.id); }
  const ownCollection = crypto.randomUUID(), foreignCollection = crypto.randomUUID();
  await pool.query("INSERT INTO smart_collections(id,owner_user_id,name,normalized_name) VALUES($1,$2,'Media Own','media own'),($3,$4,'Media Foreign','media foreign')", [ownCollection, users[0], foreignCollection, users[1]]);

  assert.equal((await call("/api/media/uploads", "POST", { filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 10 })).response.status, 401);
  assert.equal((await call("/api/media/uploads", "POST", { filename: "x.exe", mimeType: "application/octet-stream", sizeBytes: 10 }, sessions[0])).response.status, 415);
  assert.equal((await call("/api/media/uploads", "POST", { filename: "x.mp4", mimeType: "video/mp4", sizeBytes: 100 * 1024 * 1024 + 1 }, sessions[0])).response.status, 413);
  assert.equal((await call("/api/media/uploads", "POST", { filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 10, userId: users[1] }, sessions[0])).response.status, 400);
  assert.equal((await call("/api/media/uploads", "POST", { filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 10, collectionId: foreignCollection }, sessions[0])).response.status, 403);
  const requested = await call("/api/media/uploads", "POST", { filename: "../../private/Plan.pdf", mimeType: "application/pdf", mediaType: "PDF", sizeBytes: 2048, collectionId: ownCollection }, sessions[0]);
  assert.equal(requested.response.status, 201, JSON.stringify(requested.body)); const assetId = requested.body.asset.id;
  assert.equal(requested.body.asset.safeFilename, "Plan.pdf"); assert.equal(requested.body.asset.status, "PENDING");
  assert.equal(JSON.stringify(requested.body).includes("test-secret"), false); assert.equal(JSON.stringify(requested.body).includes("test-access"), false);
  const row = (await pool.query("SELECT * FROM media_assets WHERE id=$1", [assetId])).rows[0]; assert.equal(row.user_id, users[0]); assert.match(row.storage_key, /^users\/[0-9a-f]{24}\/media\//); assert.equal(JSON.stringify(row).includes("signature="), false);
  assert.equal(Number((await pool.query("SELECT COUNT(*) n FROM smart_collection_media_items WHERE collection_id=$1 AND media_asset_id=$2", [ownCollection, assetId])).rows[0].n), 1);
  assert.equal((await call(`/api/media/${assetId}/complete`, "POST", {}, sessions[0])).response.status, 409);
  storage.objects.set(row.storage_key, { sizeBytes: 2048, mimeType: "application/pdf", etag: "verified-etag" });
  const completed = await call(`/api/media/${assetId}/complete`, "POST", {}, sessions[0]); assert.equal(completed.response.status, 200); assert.equal(completed.body.asset.status, "READY");
  assert.equal((await call(`/api/media/${assetId}/access`, "GET", null, sessions[1])).response.status, 403);
  assert.equal((await call(`/api/media/${assetId}`, "DELETE", null, sessions[1])).response.status, 403);
  const read = await call(`/api/media/${assetId}/access`, "GET", null, sessions[0]); assert.equal(read.response.status, 200); assert.equal(read.body.access.method, "GET");
  assert.equal((await call("/api/media/uploads", "POST", { filename: "second.png", mimeType: "image/png", sizeBytes: 10 }, sessions[0])).response.status, 409);
  app.locals.mediaStorageFactory = () => createMockObjectStorage({ objects: Object.fromEntries(storage.objects), failDelete: true });
  assert.equal((await call(`/api/media/${assetId}`, "DELETE", null, sessions[0])).response.status, 503); assert.equal((await pool.query("SELECT status FROM media_assets WHERE id=$1", [assetId])).rows[0].status, "DELETING");
  app.locals.mediaStorageFactory = () => storage;
  assert.equal((await call(`/api/media/${assetId}`, "DELETE", null, sessions[0])).response.status, 200); assert.equal(Number((await pool.query("SELECT COUNT(*) n FROM media_assets WHERE id=$1", [assetId])).rows[0].n), 0);
  console.log("PASS  media PostgreSQL auth, ownership, collection relation, MIME/size/quota, verification, private read, delete retry and cleanup");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  delete app.locals.mediaConfigFactory; delete app.locals.mediaStorageFactory;
  await pool.query("DELETE FROM users WHERE username=ANY($1::text[])", [usernames]).catch(() => {}); await pool.end();
});
