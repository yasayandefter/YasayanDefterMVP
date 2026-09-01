"use strict";

const db = require("../db");
const databaseConfig = require("../db/config");
const repository = require("../repositories/mediaAssetsRepository");
const { getMediaConfig, getMediaCleanupConfig } = require("../storage/mediaConfig");
const { createObjectStorage } = require("../storage/objectStorage");
const { createMediaCleanupService } = require("../services/mediaCleanupService");

async function main(argv = process.argv.slice(2), env = process.env) {
  const dryRun = argv.includes("--dry-run");
  if (argv.some(value => value !== "--dry-run")) throw new Error("MEDIA_CLEANUP_ARGUMENT_INVALID");
  if (databaseConfig.getConfig(env).storageMode !== "postgres") throw new Error("MEDIA_CLEANUP_POSTGRES_REQUIRED");
  const mediaConfig = getMediaConfig(env), cleanupConfig = getMediaCleanupConfig(env);
  if (!mediaConfig.configured) throw new Error(mediaConfig.errorCode || "MEDIA_STORAGE_UNAVAILABLE");
  if (!cleanupConfig.configured) throw new Error(cleanupConfig.errorCode);
  const storage = createObjectStorage({ config: mediaConfig });
  if (!storage.available) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  const result = await createMediaCleanupService({ repository, objectStorage: storage, config: cleanupConfig }).run({ dryRun });
  console.log(JSON.stringify({ ok: !result.partialFailure, dryRun: result.dryRun, candidateCount: result.candidateCount, categories: result.categories, processed: result.processed, failed: result.failed }));
  return result.partialFailure ? 1 : 0;
}

if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => { console.error(JSON.stringify({ ok: false, code: String(error?.message || "MEDIA_CLEANUP_FAILED").replace(/[^A-Z0-9_]/gi, "_").slice(0, 60) })); process.exitCode = 2; }).finally(() => db.closePool());

module.exports = { main };
