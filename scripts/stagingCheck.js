"use strict";

const net = require("node:net");
const { Pool } = require("pg");
const { listMigrations } = require("../db/migrate");
const { getConfig: getDatabaseConfig } = require("../db/config");
const { getConfig: getAuthConfig } = require("../auth/config");

const EXPECTED_DATABASE = "yasayan_defter_test";
const EXPECTED_USER = "yasayan_defter_test";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validateOrigin(raw) {
  let url;
  try { url = new URL(String(raw || "")); } catch (_) { fail("APP_ORIGIN_INVALID"); }
  if (url.protocol !== "https:" || url.origin !== String(raw || "") || url.username || url.password) fail("APP_ORIGIN_HTTPS_REQUIRED");
}

function checkPort(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(Object.assign(new Error("PORT_UNAVAILABLE"), { code: "PORT_UNAVAILABLE" })));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

async function run(env = process.env) {
  if (!env.TEST_DATABASE_URL) fail("TEST_DATABASE_URL_REQUIRED");
  if (!env.DATABASE_URL || env.DATABASE_URL !== env.TEST_DATABASE_URL) fail("TEST_DATABASE_URL_ONLY");
  if (env.NODE_ENV !== "production") fail("NODE_ENV_PRODUCTION_REQUIRED");

  const database = getDatabaseConfig(env);
  const auth = getAuthConfig(env);
  if (database.storageMode !== "postgres" || auth.authMode !== "production") fail("PRODUCTION_MODES_REQUIRED");
  validateOrigin(env.APP_ORIGIN);

  const port = Number.parseInt(env.PORT || "", 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail("PORT_INVALID");
  await checkPort(port);

  if (Number.parseInt(process.versions.node.split(".")[0], 10) < 18) fail("NODE_VERSION_UNSUPPORTED");
  for (const dependency of ["express", "pg"]) require.resolve(dependency);

  const pool = new Pool({
    connectionString: env.TEST_DATABASE_URL,
    max: Math.min(database.poolMax, 2),
    idleTimeoutMillis: database.idleTimeoutMillis,
    connectionTimeoutMillis: database.connectionTimeoutMillis
  });
  try {
    const identity = await pool.query("SELECT current_database() AS database, current_user AS username");
    if (identity.rows[0].database !== EXPECTED_DATABASE || identity.rows[0].username !== EXPECTED_USER) fail("TEST_DATABASE_IDENTITY_MISMATCH");

    const expected = listMigrations().map(item => item.version);
    const applied = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
    const actual = applied.rows.map(row => row.version);
    if (JSON.stringify(actual) !== JSON.stringify(expected) || expected.join(",") !== "001,002,003,004,005,006") fail("MIGRATIONS_NOT_CURRENT");

    const archive = await pool.query("SELECT to_regclass('public.legacy_unassigned_quiz_attempts') IS NOT NULL AS attempts, to_regclass('public.legacy_unassigned_memory') IS NOT NULL AS memory");
    if (!archive.rows[0].attempts || !archive.rows[0].memory) fail("ARCHIVE_TABLES_MISSING");

    return {
      ok: true,
      environment: "staging-simulation",
      nodeVersionSupported: true,
      modes: { node: "production", auth: "production", storage: "postgres" },
      databaseIdentityVerified: true,
      migrations: actual,
      archiveTables: true,
      appOriginHttps: true,
      portAvailable: true,
      dependenciesAvailable: true
    };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  run().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({ ok: false, code: error.code || error.message || "STAGING_PREFLIGHT_FAILED" }));
    process.exitCode = 1;
  });
}

module.exports = { run, validateOrigin };
