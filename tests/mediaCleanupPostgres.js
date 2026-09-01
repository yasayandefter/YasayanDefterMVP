"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  media cleanup PostgreSQL: TEST_DATABASE_URL missing"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");
Object.assign(process.env, { ACCESS_MODE: "authenticated", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test" });
const repository = require("../repositories/mediaAssetsRepository");
const { createMediaCleanupService } = require("../services/mediaCleanupService");
const { createMockObjectStorage } = require("../storage/mockObjectStorage");
const { getMediaCleanupConfig } = require("../storage/mediaConfig");
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });
const users = Array.from({ length: 6 }, () => crypto.randomUUID()), prefix = crypto.randomBytes(5).toString("hex");
const limits = { maxAssetCountPerUser: 50, maxTotalBytesPerUser: 100, maxOutstandingUploadsPerUser: 3, uploadInitLimitPerWindow: 10, uploadInitWindowSeconds: 900 };
function value(userId, sizeBytes = 60, statusId = crypto.randomUUID()) { return { id: statusId, userId, storageProvider: "b2", storageKey: `users/phase4a/media/${statusId}/file.pdf`, originalFilename: "file.pdf", safeFilename: "file.pdf", mediaType: "PDF", mimeType: "application/pdf", sizeBytes, collectionId: null }; }

(async () => {
  await pool.query("INSERT INTO users(id,role,username,password_hash,status) SELECT id,'USER','phase4a_'||$1||'_'||ordinal,'fixture','ACTIVE' FROM UNNEST($2::uuid[]) WITH ORDINALITY AS u(id,ordinal)", [prefix, users]);
  const same = await Promise.all([repository.reservePending(value(users[0]), limits), repository.reservePending(value(users[0]), limits)]);
  assert.equal(same.filter(item => item.asset).length, 1); assert.equal(same.filter(item => item.reason === "QUOTA").length, 1);
  const independent = await Promise.all([repository.reservePending(value(users[1], 60), limits), repository.reservePending(value(users[2], 60), limits)]); assert.equal(independent.every(item => item.asset), true);
  for (let index = 0; index < 3; index += 1) assert.ok((await repository.reservePending(value(users[3], 1), limits)).asset);
  assert.equal((await repository.reservePending(value(users[3], 1), limits)).reason, "OUTSTANDING");
  const windowLimits = { ...limits, maxOutstandingUploadsPerUser: 20, uploadInitLimitPerWindow: 10 };
  for (let index = 0; index < 10; index += 1) assert.ok((await repository.reservePending(value(users[4], 1), windowLimits)).asset);
  assert.equal((await repository.reservePending(value(users[4], 1), windowLimits)).reason, "INIT_RATE");
  const stateIds = ["PENDING", "READY", "FAILED", "DELETING"].map(() => crypto.randomUUID());
  for (let index = 0; index < stateIds.length; index += 1) { const item = value(users[5], 5, stateIds[index]); await pool.query("INSERT INTO media_assets(id,user_id,storage_provider,storage_key,original_filename,safe_filename,media_type,mime_type,size_bytes,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()-INTERVAL '2 hours',NOW()-INTERVAL '2 hours')", [item.id,item.userId,item.storageProvider,item.storageKey,item.originalFilename,item.safeFilename,item.mediaType,item.mimeType,item.sizeBytes,["PENDING","READY","FAILED","DELETING"][index]]); }
  assert.deepEqual(await repository.usageForUser(users[5]), { assetCount: 4, totalBytes: 20 });
  const before = new Date(Date.now() - 1800 * 1000), retryBefore = new Date(Date.now() - 300 * 1000);
  const claims = await Promise.all([repository.claimCleanupCandidates(before, retryBefore, 2), repository.claimCleanupCandidates(before, retryBefore, 2)]);
  const claimedIds = claims.flat().map(item => item.id); assert.equal(new Set(claimedIds).size, claimedIds.length); assert.equal(claimedIds.length, 3, "READY is not cleanup eligible");
  await pool.query("UPDATE media_assets SET updated_at=NOW()-INTERVAL '10 minutes' WHERE id=ANY($1::uuid[])", [claimedIds]);
  const storage = createMockObjectStorage({ objects: Object.fromEntries(claimedIds.map(id => [`users/phase4a/media/${id}/file.pdf`, { sizeBytes: 5, mimeType: "application/pdf" }])) });
  const cleaned = await createMediaCleanupService({ repository, objectStorage: storage, config: getMediaCleanupConfig({}), now: () => new Date() }).run(); assert.equal(cleaned.processed, 3);
  assert.equal(Number((await pool.query("SELECT COUNT(*) n FROM media_assets WHERE id=ANY($1::uuid[])", [claimedIds])).rows[0].n), 0);
  console.log("PASS  PostgreSQL same-user quota serialization, independent users, outstanding/window limits, all-state accounting and concurrent cleanup claims");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]).catch(() => {}); await pool.end(); });
