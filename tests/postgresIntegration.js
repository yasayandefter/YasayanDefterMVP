"use strict";

if (!process.env.TEST_DATABASE_URL) {
  console.log("SKIP  PostgreSQL integration: TEST_DATABASE_URL is not set");
  process.exit(0);
}

const db = require("../db");
const migrations = require("../db/migrate");

(async () => {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");
  process.env.STORAGE_MODE = "postgres";
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const result = await migrations.migrate();
  if (!result.ok) throw new Error("MIGRATION_FAILED");
  console.log("PASS  PostgreSQL integration migrations applied using explicit TEST_DATABASE_URL");
})().catch(error => { console.error(error.message || "POSTGRES_INTEGRATION_FAILED"); process.exitCode = 1; }).finally(() => db.closePool());
