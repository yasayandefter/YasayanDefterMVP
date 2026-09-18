"use strict";
// Isolated authenticated QA against an explicitly supplied local test database.
const assert = require("node:assert/strict"), crypto = require("node:crypto"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process"), { Pool } = require("pg");
const connectionString = process.env.TEST_DATABASE_URL;
assert.ok(connectionString, "TEST_DATABASE_URL required");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(connectionString).hostname), "Local QA database required");
const pool = new Pool({ connectionString, max: 1 });
const username = "resume_ui_" + crypto.randomBytes(6).toString("hex"), password = crypto.randomBytes(24).toString("base64url") + "aA1!";
const port = 49000 + crypto.randomInt(500), base = `http://127.0.0.1:${port}`;
let server;
(async () => {
  await pool.query("INSERT INTO users(id,role,username,display_name,password_hash,status) VALUES($1,'USER',$2,'UI İnceleme',$3,'ACTIVE')", [crypto.randomUUID(), username, require("../auth/password").hashPassword(password)]);
  const env = { ...process.env, PORT: String(port), ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: connectionString, APP_ORIGIN: base, NODE_ENV: "test", QA_BASE_URL: base, QA_USERNAME: username, QA_PASSWORD: password, QA_SEED: process.env.QA_SEED ?? "1", QA_OUTPUT: process.env.QA_OUTPUT || path.join(os.tmpdir(), "yd158-resume-qa") };
  server = spawn(process.execPath, ["server.js"], { env, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base + "/api/status")).ok) { ready = true; break; } } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "QA server did not start");
  const test = spawn(process.execPath, ["tests/commercialProduct158Browser.js"], { env, stdio: ["ignore", "ignore", "pipe"] });
  let diagnostic = "";
  test.stderr.on("data", chunk => { diagnostic += chunk; });
  const code = await new Promise(resolve => test.once("exit", resolve));
  // Browser failures must never expose generated login values.
  diagnostic = diagnostic.split(password).join("[redacted]").split(username).join("[QA user]").split(connectionString).join("[redacted]");
  if (code) throw new Error(diagnostic || "Commercial browser QA failed");
  const report = JSON.parse(fs.readFileSync(path.join(env.QA_OUTPUT, "product-report.json"), "utf8"));
  console.log(JSON.stringify({ passed: report.passed, workspaces: report.workspaces.length, tools: report.tools.length, errors: report.errors, duplicateResearchRequests: report.duplicateResearchRequests, overviewUnchanged: report.overviewUnchanged, states: report.states, output: env.QA_OUTPUT }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server.once("exit", resolve)); }
  await pool.query("DELETE FROM users WHERE username=$1", [username]);
  await pool.end();
});
