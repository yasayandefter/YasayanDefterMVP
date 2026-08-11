"use strict";

const MODES = new Set(["json", "postgres"]);

function numberEnv(name, fallback, minimum, maximum) {
  const value = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function getConfig(env = process.env) {
  const storageMode = String(env.STORAGE_MODE || "json").trim().toLowerCase();
  if (!MODES.has(storageMode)) throw new Error("STORAGE_MODE_INVALID");
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  if (storageMode === "postgres" && !databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  return Object.freeze({
    storageMode,
    databaseUrl,
    poolMax: numberEnv("PG_POOL_MAX", 10, 1, 50),
    idleTimeoutMillis: numberEnv("PG_IDLE_TIMEOUT_MS", 10000, 1000, 300000),
    connectionTimeoutMillis: numberEnv("PG_CONNECTION_TIMEOUT_MS", 10000, 1000, 60000),
    nodeEnv: String(env.NODE_ENV || "development")
  });
}

function publicConfig(env = process.env) {
  const config = getConfig(env);
  return { storageMode: config.storageMode, nodeEnv: config.nodeEnv, poolMax: config.poolMax, idleTimeoutMillis: config.idleTimeoutMillis };
}

module.exports = { MODES, getConfig, publicConfig };
