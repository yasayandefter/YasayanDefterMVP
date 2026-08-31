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
  const value = Number.parseInt(env[name] || "", 10);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function getMediaConfig(env = process.env) {
  const provider = String(env.MEDIA_STORAGE_PROVIDER || "").trim().toLowerCase();
  const accountId = String(env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = String(env.R2_BUCKET_NAME || "").trim();
  const required = { accountId, accessKeyId, secretAccessKey, bucket };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name);
  const configured = provider === "r2" && missing.length === 0;
  const errorCode = !provider ? "MEDIA_STORAGE_DISABLED" : provider !== "r2" ? "MEDIA_STORAGE_PROVIDER_INVALID" : missing.length ? "MEDIA_STORAGE_CONFIG_INCOMPLETE" : null;
  return Object.freeze({
    provider: provider || "disabled",
    configured,
    errorCode,
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: String(env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")).trim(),
    uploadTtlSeconds: integer(env, "MEDIA_UPLOAD_URL_TTL_SECONDS", 600, 300, 900),
    readTtlSeconds: integer(env, "MEDIA_READ_URL_TTL_SECONDS", 600, 60, 900),
    maxTotalBytesPerUser: integer(env, "MEDIA_MAX_TOTAL_BYTES_PER_USER", 1024 * MIB, 100 * MIB, 100 * 1024 * MIB),
    maxAssetCountPerUser: integer(env, "MEDIA_MAX_ASSET_COUNT_PER_USER", 500, 1, 10000),
    mimePolicies: MIME_POLICIES
  });
}

function publicMediaConfig(env = process.env) {
  const config = getMediaConfig(env);
  return { provider: config.provider, available: config.configured, errorCode: config.errorCode, uploadTtlSeconds: config.uploadTtlSeconds, readTtlSeconds: config.readTtlSeconds, maxTotalBytesPerUser: config.maxTotalBytesPerUser, maxAssetCountPerUser: config.maxAssetCountPerUser };
}

module.exports = { MIB, MIME_POLICIES, getMediaConfig, publicMediaConfig };
