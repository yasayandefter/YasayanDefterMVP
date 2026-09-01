"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const { getMediaConfig } = require("../storage/mediaConfig");
const { createMockObjectStorage } = require("../storage/mockObjectStorage");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  collection media PostgreSQL: TEST_DATABASE_URL missing"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const port = 53500 + crypto.randomInt(400), base = `http://127.0.0.1:${port}`;
Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, STORAGE_MODE: "postgres", ACCESS_MODE: "authenticated", AUTH_MODE: "production", APP_ORIGIN: base, NODE_ENV: "test" });
const app = require("../server");
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
const storage = createMockObjectStorage();
const config = getMediaConfig({ MEDIA_STORAGE_PROVIDER: "b2", B2_ENDPOINT: "https://s3.invalid", B2_REGION: "test-region", B2_BUCKET_NAME: "test-bucket", B2_KEY_ID: "fixture-key", B2_APPLICATION_KEY: "fixture-secret" });
const suffix = crypto.randomBytes(5).toString("hex"), usernames = [`cm_a_${suffix}`, `cm_b_${suffix}`];
let server;

async function call(path, method = "GET", body, cookie) { const response = await fetch(base + path, { method, headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { Origin: base } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { response, body: await response.json().catch(() => ({})) }; }

(async () => {
  const constraint = await pool.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='media_assets_provider_check'");
  assert.match(constraint.rows[0]?.definition || "", /'b2'/, "migration 016 must be applied to the isolated test database before running this deferred test");
  app.locals.mediaConfigFactory = () => config; app.locals.mediaStorageFactory = () => storage; server = app.listen(port);
  const sessions = [], users = [];
  for (const username of usernames) { const registered = await call("/api/auth/register", "POST", { username, password: "Collection-media-15.7!" }); assert.equal(registered.response.status, 201); sessions.push(String(registered.response.headers.get("set-cookie")).split(";")[0]); users.push(registered.body.user.id); }
  const collection = crypto.randomUUID(), foreignCollection = crypto.randomUUID();
  await pool.query("INSERT INTO smart_collections(id,owner_user_id,name,normalized_name) VALUES($1,$2,'Media A','media a'),($3,$4,'Media B','media b')", [collection, users[0], foreignCollection, users[1]]);
  const initialized = await call("/api/media/uploads", "POST", { filename: "fixture.pdf", mimeType: "application/pdf", mediaType: "PDF", sizeBytes: 1200 }, sessions[0]);
  assert.equal(initialized.response.status, 201); const assetId = initialized.body.asset.id;
  const row = (await pool.query("SELECT storage_key FROM media_assets WHERE id=$1", [assetId])).rows[0]; storage.objects.set(row.storage_key, { sizeBytes: 1200, mimeType: "application/pdf", etag: "phase3a" });
  assert.equal((await call(`/api/media/${assetId}/complete`, "POST", {}, sessions[0])).response.status, 200);
  assert.equal((await call(`/api/collections/${collection}/media`, "POST", { mediaAssetIds: [assetId] }, sessions[1])).response.status, 403);
  assert.equal((await call(`/api/collections/${collection}/media`, "POST", { mediaAssetIds: [assetId] }, sessions[0])).body.added, 1);
  assert.equal((await call(`/api/collections/${collection}/media`, "POST", { mediaAssetIds: [assetId] }, sessions[0])).body.added, 0);
  const listed = await call(`/api/collections/${collection}/media`, "GET", null, sessions[0]); assert.equal(listed.body.media.length, 1); assert.equal(listed.body.media[0].status, "READY");
  assert.equal((await call(`/api/collections/${collection}/media`, "GET", null, sessions[1])).response.status, 403);
  const detail = await call(`/api/collections/${collection}`, "GET", null, sessions[0]); assert.deepEqual({ recordCount: detail.body.collection.recordCount, mediaCount: detail.body.collection.mediaCount, itemCount: detail.body.collection.itemCount }, { recordCount: 0, mediaCount: 1, itemCount: 1 });
  assert.equal((await call(`/api/collections/${collection}/media/${assetId}`, "DELETE", null, sessions[1])).response.status, 403);
  assert.equal((await call(`/api/collections/${collection}/media/${assetId}`, "DELETE", null, sessions[0])).response.status, 200);
  assert.equal(Number((await pool.query("SELECT COUNT(*) n FROM media_assets WHERE id=$1", [assetId])).rows[0].n), 1);
  assert.equal((await call(`/api/media/${assetId}`, "DELETE", null, sessions[0])).response.status, 200);
  console.log("PASS  collection media PostgreSQL B2 constraint, READY listing, attach/remove, duplicate safety, combined counts and cross-user isolation");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve)); delete app.locals.mediaConfigFactory; delete app.locals.mediaStorageFactory;
  await pool.query("DELETE FROM users WHERE username=ANY($1::text[])", [usernames]).catch(() => {}); await pool.end();
});
