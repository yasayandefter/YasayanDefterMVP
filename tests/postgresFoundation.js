"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../db/config");
const migrations = require("../db/migrate");
const db = require("../db");

assert.equal(config.getConfig({}).storageMode, "json");
assert.equal(config.getConfig({ STORAGE_MODE: "json" }).storageMode, "json");
assert.throws(() => config.getConfig({ STORAGE_MODE: "postgres" }), /DATABASE_URL_REQUIRED/);
assert.equal(config.getConfig({ STORAGE_MODE: "postgres", DATABASE_URL: "postgres://redacted" }).storageMode, "postgres");
const bounded = config.getConfig({ STORAGE_MODE: "postgres", DATABASE_URL: "postgres://redacted", PG_POOL_MAX: "9999", PG_IDLE_TIMEOUT_MS: "-1", PG_CONNECTION_TIMEOUT_MS: "invalid" });
assert.equal(bounded.poolMax, 50);
assert.equal(bounded.idleTimeoutMillis, 1000);
assert.equal(bounded.connectionTimeoutMillis, 10000);
assert.deepEqual(migrations.listMigrations().map(item => item.version), ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012", "013", "014"]);
assert.ok(migrations.listMigrations().every(item => item.sql.length > 100));
for (const repository of ["studentsRepository", "classroomsRepository", "memoryRepository", "learningActivityRepository", "quizRepository", "sessionRepository", "usersRepository", "claimRepository", "membershipRepository"]) {
  const loaded = require(path.join("..", "repositories", repository));
  assert.ok(loaded.name);
}
assert.equal(config.publicConfig({ STORAGE_MODE: "json", NODE_ENV: "test", DATABASE_URL: "postgres://secret" }).storageMode, "json");
assert.equal(JSON.stringify(config.publicConfig({ STORAGE_MODE: "postgres", NODE_ENV: "test", DATABASE_URL: "postgres://secret" })).includes("DATABASE_URL"), false);
assert.ok(fs.existsSync(path.join(__dirname, "..", "db", "migrations", "001_initial_schema.sql")));
assert.ok(fs.existsSync(path.join(__dirname, "..", "db", "migrations", "006_legacy_migration_archive.sql")));
const generalUserMigration = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "007_general_user_accounts.sql"), "utf8");
assert.match(generalUserMigration, /'USER'/);
assert.match(generalUserMigration, /owner_user_id/);
db.closePool().then(() => console.log("PASS  postgres config, migration discovery, repository loading, and secret safety"));
