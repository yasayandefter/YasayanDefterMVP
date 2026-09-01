"use strict";

function cleanupError(code) { const error = new Error(code); error.code = code; return error; }

function createMediaCleanupService(options) {
  const repository = options.repository;
  const objectStorage = options.objectStorage;
  const config = options.config;
  const now = options.now || (() => new Date());
  if (!repository) throw cleanupError("MEDIA_CLEANUP_REPOSITORY_REQUIRED");
  if (!objectStorage) throw cleanupError("MEDIA_CLEANUP_STORAGE_REQUIRED");
  if (!config?.configured) throw cleanupError(config?.errorCode || "MEDIA_CLEANUP_CONFIG_INVALID");

  async function run(runOptions = {}) {
    const current = now();
    const before = new Date(current.getTime() - config.staleSeconds * 1000);
    const retryBefore = new Date(current.getTime() - config.retrySeconds * 1000);
    if (runOptions.dryRun) {
      const categories = await repository.cleanupSummary(before, config.batchSize);
      return { dryRun: true, candidateCount: categories.reduce((sum, item) => sum + item.count, 0), categories, processed: 0, failed: 0 };
    }
    const candidates = await repository.claimCleanupCandidates(before, retryBefore, config.batchSize);
    const categories = {}, failures = [];
    for (const asset of candidates) {
      const category = asset.cleanupOriginalStatus || asset.status;
      categories[category] = (categories[category] || 0) + 1;
      try {
        await objectStorage.deleteObject({ key: asset.storageKey });
        await repository.deleteMetadata(asset.id, asset.userId);
      } catch (_) { failures.push("MEDIA_CLEANUP_PROVIDER_FAILURE"); }
    }
    return { dryRun: false, candidateCount: candidates.length, categories: Object.entries(categories).map(([status, count]) => ({ status, count })), processed: candidates.length - failures.length, failed: failures.length, partialFailure: failures.length > 0 };
  }

  return Object.freeze({ run });
}

module.exports = { createMediaCleanupService, cleanupError };
