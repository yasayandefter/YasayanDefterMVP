"use strict";

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function targetIdentity(value, label) {
  let parsed;
  try { parsed = new URL(String(value || "")); }
  catch (_) { throw failure(`${label}_INVALID`); }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || !parsed.hostname || !parsed.username) throw failure(`${label}_INVALID`);
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).trim().toLowerCase();
  if (!database || database.includes("/")) throw failure(`${label}_INVALID`);
  const username = decodeURIComponent(parsed.username).toLowerCase();
  return {
    normalized: `${username}@${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${database}`,
    database,
    username,
    labels: [username, parsed.hostname, database].map(item => item.toLowerCase())
  };
}

function assertIsolatedTestDatabase(env) {
  if (!String(env.TEST_DATABASE_URL || "").trim()) throw failure("TEST_DATABASE_URL_REQUIRED");
  if (String(env.TEST_DATABASE_ISOLATED || "").trim() !== "1") throw failure("TEST_DATABASE_ISOLATION_UNCONFIRMED");
  const test = targetIdentity(env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
  if (test.labels.some(value => /(^|[-_.])(prod|production|live)([-_.]|$)/i.test(value))) throw failure("TEST_DATABASE_PRODUCTION_IDENTITY");
  for (const name of ["DATABASE_URL", "PRODUCTION_DATABASE_URL"]) {
    const value = String(env[name] || "").trim();
    if (!value) continue;
    if (targetIdentity(value, name).normalized === test.normalized) throw failure("TEST_DATABASE_MATCHES_PRODUCTION_TARGET");
  }
  env.DATABASE_URL = env.TEST_DATABASE_URL;
  return { database: test.database, username: test.username };
}

module.exports = { assertIsolatedTestDatabase, targetIdentity };
