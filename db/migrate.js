"use strict";

const fs = require("node:fs");
const path = require("node:path");
const db = require("./index");
const { getConfig } = require("./config");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR).filter(file => /^\d+_[a-z0-9_-]+\.sql$/i.test(file)).sort().map(file => ({ version: file.split("_")[0], file, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }));
}

async function appliedMigrations(client) {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const result = await client.query("SELECT version FROM schema_migrations ORDER BY version");
  return new Set(result.rows.map(row => row.version));
}

async function status() {
  const config = getConfig();
  if (config.storageMode !== "postgres") return { ok: true, mode: "json", migrations: [] };
  return db.withTransaction(async client => {
    const applied = await appliedMigrations(client);
    return { ok: true, mode: "postgres", migrations: listMigrations().map(item => ({ version: item.version, applied: applied.has(item.version) })) };
  });
}

async function migrate() {
  const config = getConfig();
  if (config.storageMode !== "postgres") return { ok: false, code: "POSTGRES_MODE_REQUIRED", message: "DB migration için STORAGE_MODE=postgres gereklidir." };
  return db.withTransaction(async client => {
    const applied = await appliedMigrations(client);
    const pending = [];
    for (const item of listMigrations()) {
      if (applied.has(item.version)) continue;
      await client.query(item.sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [item.version]);
      pending.push(item.version);
    }
    return { ok: true, mode: "postgres", applied: pending };
  });
}

module.exports = { MIGRATIONS_DIR, listMigrations, status, migrate };

if (require.main === module) {
  const action = process.argv[2] || "status";
  const run = action === "migrate" ? migrate : status;
  run().then(result => { console.log(JSON.stringify(result)); if (result && result.ok === false) process.exitCode = 1; return db.closePool(); }).catch(error => { console.error(JSON.stringify({ ok: false, code: error.message || "DB_COMMAND_FAILED", message: "Database işlemi gerçekleştirilemedi." })); process.exitCode = 1; return db.closePool(); });
}
