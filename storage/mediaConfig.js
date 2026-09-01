"use strict";

const MIB = 1024 * 1024;
const MIME_POLICIES = Object.freeze({
  "application/pdf": Object.freeze({ mediaType: "PDF", maxBytes: 25 * MIB }),
  "image/jpeg": Object.freeze({ mediaType: "IMAGE", maxBytes: 10 * MIB }),
  "image/png": Object.freeze({ mediaType: "IMAGE", maxBytes: 10 * MIB }),
  "image/webp": Object.freeze({ mediaType: "IMAGE", maxBytes: 10 * MIB }),
  "audio/mpeg": Object.freeze({ mediaType: "AUDIO", maxBytes: 50 * MIB }),
  "audio/mp4": Object.freeze({ mediaType: "AUDIO", maxBytes: 50 * MIB }),
  "audio/wav": Object.freeze({ mediaType: "AUDIO", maxBytes: 50 * MIB }),
  "audio/ogg": Object.freeze({ mediaType: "AUDIO", maxBytes: 50 * MIB }),
  "video/mp4": Object.freeze({ mediaType: "VIDEO", maxBytes: 100 * MIB }),
  "video/webm": Object.freeze({ mediaType: "VIDEO", maxBytes: 100 * MIB })
});

function integer(env, name, fallback, minimum, maximum) {
  const raw = String(env[name] ?? "").trim();
  if (!raw) return { value: fallback, valid: true };
  if (!/^\d+$/.test(raw)) return { value: fallback, valid: false };
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? { value, valid: true }
    : { value: fallback, valid: false };
}

function getMediaConfig(env = process.env) {
  const provider = String(env.MEDIA_STORAGE_PROVIDER || "").trim().toLowerCase();
  const isB2 = provider === "b2";
  const accountId = isB2 ? "" : String(env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String((isB2 ? env.B2_KEY_ID : env.R2_ACCESS_KEY_ID) ?? "").trim();
  const secretAccessKey = String((isB2 ? env.B2_APPLICATION_KEY : env.R2_SECRET_ACCESS_KEY) ?? "").trim();
  const bucket = String((isB2 ? env.B2_BUCKET_NAME : env.R2_BUCKET_NAME) ?? "").trim();
  const endpoint = String((isB2 ? env.B2_ENDPOINT : env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")) ?? "").trim();
  const region = String((isB2 ? env.B2_REGION : "auto") ?? "").trim();
  const required = isB2 ? { endpoint, region, accessKeyId, secretAccessKey, bucket } : { accountId, accessKeyId, secretAccessKey, bucket };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name);
  const supported = provider === "r2" || provider === "b2" || provider === "mock";
  const configured = supported && (provider === "mock" || missing.length === 0);
  const uploadTtl = integer(env, "MEDIA_UPLOAD_URL_TTL_SECONDS", 600, 300, 900);
  const readTtl = integer(env, "MEDIA_READ_URL_TTL_SECONDS", 600, 60, 900);
  const maxBytes = integer(env, "MEDIA_MAX_TOTAL_BYTES_PER_USER", 1024 * MIB, 100 * MIB, 100 * 1024 * MIB);
  const maxAssets = integer(env, "MEDIA_MAX_ASSET_COUNT_PER_USER", 500, 1, 10000);
  const maxOutstanding = integer(env, "MEDIA_MAX_OUTSTANDING_UPLOADS_PER_USER", 3, 1, 20);
  const initLimit = integer(env, "MEDIA_UPLOAD_INIT_LIMIT_PER_WINDOW", 10, 1, 100);
  const initWindow = integer(env, "MEDIA_UPLOAD_INIT_WINDOW_SECONDS", 900, 60, 86400);
  const invalidPolicy = [uploadTtl, readTtl, maxBytes, maxAssets, maxOutstanding, initLimit, initWindow].some(item => !item.valid);
  const errorCode = !provider ? "MEDIA_STORAGE_DISABLED" : !supported ? "MEDIA_STORAGE_PROVIDER_INVALID" : missing.length && provider !== "mock" ? "MEDIA_STORAGE_CONFIG_INCOMPLETE" : invalidPolicy ? "MEDIA_STORAGE_CONFIG_INVALID" : null;
  return Object.freeze({
    provider: provider || "disabled",
    configured: configured && !invalidPolicy,
    errorCode,
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    region,
    uploadTtlSeconds: uploadTtl.value,
    readTtlSeconds: readTtl.value,
    maxTotalBytesPerUser: maxBytes.value,
    maxAssetCountPerUser: maxAssets.value,
    maxOutstandingUploadsPerUser: maxOutstanding.value,
    uploadInitLimitPerWindow: initLimit.value,
    uploadInitWindowSeconds: initWindow.value,
    mimePolicies: MIME_POLICIES
  });
}

function getMediaCleanupConfig(env = process.env) {
  const batch = integer(env, "MEDIA_CLEANUP_BATCH_SIZE", 50, 1, 100);
  const stale = integer(env, "MEDIA_CLEANUP_STALE_SECONDS", 1800, 1800, 604800);
  return Object.freeze({ configured: batch.valid && stale.valid, errorCode: batch.valid && stale.valid ? null : "MEDIA_CLEANUP_CONFIG_INVALID", batchSize: batch.value, staleSeconds: stale.value, retrySeconds: 300 });
}

function publicMediaConfig(env = process.env) {
  const config = getMediaConfig(env);
  return { provider: config.provider, available: config.configured, errorCode: config.errorCode, uploadTtlSeconds: config.uploadTtlSeconds, readTtlSeconds: config.readTtlSeconds, maxTotalBytesPerUser: config.maxTotalBytesPerUser, maxAssetCountPerUser: config.maxAssetCountPerUser, maxOutstandingUploadsPerUser: config.maxOutstandingUploadsPerUser };
}

module.exports = { MIB, MIME_POLICIES, getMediaConfig, getMediaCleanupConfig, publicMediaConfig };
