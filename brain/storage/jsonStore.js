"use strict";

const fs = require("node:fs");
const path = require("node:path");
const metrics = require("../metrics");

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function createJsonStore(file, options = {}) {
  const storeId = options.id || path.basename(file, path.extname(file));
  const expected = options.expected || "array";
  const fallback = clone(options.fallback !== undefined ? options.fallback : expected === "array" ? [] : {});
  const version = Number(options.version || 1);
  const persistenceEnabled = typeof options.persistenceEnabled === "function"
    ? options.persistenceEnabled
    : () => options.persistenceEnabled === undefined ? true : options.persistenceEnabled === true;
  const migrate = typeof options.migrate === "function" ? options.migrate : raw => {
    if (raw && !Array.isArray(raw) && raw.version && Object.prototype.hasOwnProperty.call(raw, "data")) return raw.version > version ? { unsupported: true } : raw.data;
    return raw;
  };
  function valid(value) { return expected === "array" ? Array.isArray(value) : value && typeof value === "object" && !Array.isArray(value); }
  function parse(target) {
    try {
      if (!fs.existsSync(target)) return null;
      const raw = fs.readFileSync(target, "utf8");
      if (!raw.trim()) return null;
      const migrated = migrate(JSON.parse(raw));
      if (migrated?.unsupported) return null;
      return valid(migrated) ? migrated : null;
    } catch (_) { return null; }
  }
  function ensureDir() { fs.mkdirSync(path.dirname(file), { recursive: true }); }
  function read() {
    const startedAt = Date.now();
    if (!persistenceEnabled()) {
      metrics.recordStorage(storeId, "read", Date.now() - startedAt, true, false);
      return { value: clone(fallback), recovered: false, source: "fallback" };
    }
    const primary = parse(file);
    if (primary !== null) { metrics.recordStorage(storeId, "read", Date.now() - startedAt, true, false); return { value: primary, recovered: false, source: "primary" }; }
    const backup = parse(`${file}.bak`);
    if (backup !== null) {
      try { fs.copyFileSync(`${file}.bak`, file); } catch (_) {}
      metrics.recordStorage(storeId, "recovery", Date.now() - startedAt, true, true); return { value: backup, recovered: true, source: "backup" };
    }
    metrics.recordStorage(storeId, "read", Date.now() - startedAt, true, false); return { value: clone(fallback), recovered: false, source: "fallback" };
  }
  function write(value, options = {}) {
    const startedAt = Date.now();
    if (!valid(value)) { metrics.recordStorage(storeId, "write", Date.now() - startedAt, false); return { ok: false, error: "INVALID_ROOT" }; }
    if (!persistenceEnabled()) { metrics.recordStorage(storeId, "write", Date.now() - startedAt, true); return { ok: true, ephemeral: true }; }
    ensureDir();
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const backup = `${file}.bak`;
    try {
      const payload = options.envelope ? { version, updatedAt: new Date().toISOString(), data: value } : value;
      const descriptor = fs.openSync(temp, "wx");
      try { fs.writeFileSync(descriptor, JSON.stringify(payload, null, 2), "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
      if (fs.existsSync(file)) fs.copyFileSync(file, backup);
      fs.renameSync(temp, file);
      metrics.recordStorage(storeId, "write", Date.now() - startedAt, true); return { ok: true };
    } catch (error) {
      try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) {}
      metrics.recordStorage(storeId, "write", Date.now() - startedAt, false); return { ok: false, error: error.code || "WRITE_FAILED" };
    }
  }
  function update(mutator) {
    const current = read();
    const next = mutator(clone(current.value));
    const result = write(next);
    return result.ok ? { ...result, value: next, recovered: current.recovered } : result;
  }
  return { file, read, write, update, backup: () => parse(`${file}.bak`), recover: read };
}

module.exports = { createJsonStore };
