"use strict";

function mapDatabaseError(error, fallback = "DATABASE_OPERATION_FAILED") {
  const mapped = new Error(fallback);
  mapped.code = error?.code === "23505" ? "DUPLICATE_RESOURCE" : error?.code === "23503" ? "RELATED_RESOURCE_NOT_FOUND" : fallback;
  return mapped;
}

function jsonValue(value, fallback) {
  try {
    const encoded = JSON.stringify(value, (_, item) => {
      if (typeof item === "function" || typeof item === "undefined") return undefined;
      if (item && typeof item === "object" && Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) return {};
      return item;
    });
    return encoded === undefined ? fallback : encoded;
  } catch (_) { return fallback; }
}

function page(value, fallback = 50, maximum = 200) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(1, parsed)) : fallback;
}

module.exports = { mapDatabaseError, jsonValue, page };
