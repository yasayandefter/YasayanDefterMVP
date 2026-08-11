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
assert.deepEqual(migrations.listMigrations().map(item => item.version), ["001", "002", "003", "004", "005"]);
assert.ok(migrations.listMigrations().every(item => item.sql.length > 100));
for (const repository of ["studentsRepository", "classroomsRepository", "memoryRepository", "quizRepository", "sessionRepository", "usersRepository", "claimRepository", "membershipRepository"]) {
  const loaded = require(path.join("..", "repositories", repository));
  assert.ok(loaded.name);
}
assert.equal(config.publicConfig({ STORAGE_MODE: "json", NODE_ENV: "test", DATABASE_URL: "postgres://secret" }).storageMode, "json");
assert.equal(JSON.stringify(config.publicConfig({ STORAGE_MODE: "postgres", NODE_ENV: "test", DATABASE_URL: "postgres://secret" })).includes("DATABASE_URL"), false);
assert.ok(fs.existsSync(path.join(__dirname, "..", "db", "migrations", "001_initial_schema.sql")));
db.closePool().then(() => console.log("PASS  postgres config, migration discovery, repository loading, and secret safety"));
