"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEYS = /^(authorization|cookie|set-cookie|apikey|api_key|token|accesstoken|refreshtoken|password|secret)$/i;
const requestContext = new AsyncLocalStorage();

function currentLevel() {
  const configured = String(process.env.LOG_LEVEL || "info").toLowerCase();
  if (configured === "debug") return process.env.NODE_ENV === "production" ? "info" : "debug";
  return LEVELS[configured] ? configured : "info";
}

function safeString(value) {
  const text = String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password|token|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]");
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

function sanitize(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return safeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return safeString(value);
  if (typeof value !== "object") return safeString(value);
  if (depth > 4) return "[Truncated]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitize(item, seen, depth + 1));
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    output[key] = SENSITIVE_KEYS.test(key) ? "[REDACTED]" : sanitize(item, seen, depth + 1);
  }
  return output;
}

function write(level, event, fields = {}) {
  if (LEVELS[level] < LEVELS[currentLevel()]) return;
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event: safeString(event)
    };
    const contextRequestId = requestContext.getStore();
    const normalizedFields = sanitize(fields) || {};
    if (contextRequestId && !normalizedFields.requestId) normalizedFields.requestId = contextRequestId;
    Object.assign(payload, normalizedFields);
    const output = `${JSON.stringify(payload)}\n`;
    (level === "error" ? process.stderr : process.stdout).write(output);
  } catch (_) {
    // Logging must never take down the request or research pipeline.
  }
}

function error(event, err, fields = {}) {
  const errorFields = err instanceof Error
    ? {
        ...fields,
        errorName: err.name,
        errorMessage: safeString(err.message),
        errorCode: err.code,
        ...(process.env.NODE_ENV === "production" ? {} : { stack: err.stack })
      }
    : { ...fields, errorMessage: safeString(err) };
  write("error", event, errorFields);
}

module.exports = {
  debug: (event, fields) => write("debug", event, fields),
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields),
  error,
  sanitize,
  runWithRequest: (requestId, callback) => requestContext.run(requestId, callback)
};
