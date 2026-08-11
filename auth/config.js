"use strict";

const { getConfig: getDatabaseConfig } = require("../db/config");

function numberEnv(env, name, fallback, min, max) {
  const value = Number.parseInt(env[name] || "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function normalizeOrigins(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

function getConfig(env = process.env) {
  const authMode = String(env.AUTH_MODE || "local").trim().toLowerCase();
  if (!["local", "production"].includes(authMode)) throw new Error("AUTH_MODE_INVALID");
  const database = getDatabaseConfig(env);
  if (authMode === "production" && database.storageMode !== "postgres") throw new Error("AUTH_REQUIRES_POSTGRES");
  const nodeEnv = String(env.NODE_ENV || "development");
  const production = authMode === "production" || nodeEnv === "production";
  return Object.freeze({
    authMode,
    sessionTtlSeconds: numberEnv(env, "SESSION_TTL_SECONDS", 7 * 86400, 300, 90 * 86400),
    cookieName: "yd_session",
    cookieSecure: production ? true : String(env.COOKIE_SECURE || "").toLowerCase() === "true",
    cookieSameSite: String(env.COOKIE_SAMESITE || "lax").toLowerCase() === "strict" ? "Strict" : "Lax",
    appOrigins: normalizeOrigins(env.APP_ORIGIN),
    nodeEnv,
    database
  });
}

function publicConfig(env = process.env) {
  const config = getConfig(env);
  return { authMode: config.authMode, cookieName: config.cookieName, cookieSecure: config.cookieSecure, cookieSameSite: config.cookieSameSite, sessionTtlSeconds: config.sessionTtlSeconds, appOrigins: config.appOrigins };
}

module.exports = { getConfig, publicConfig, normalizeOrigins };
