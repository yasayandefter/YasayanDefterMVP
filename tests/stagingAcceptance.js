"use strict";

const assert = require("node:assert/strict");
const net = require("node:net");
const { spawn } = require("node:child_process");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  Staging acceptance: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}

function safe(text) {
  const value = String(text || "");
  assert.equal(value.includes(process.env.TEST_DATABASE_URL), false);
  assert.equal(/postgres(?:ql)?:\/\//i.test(value), false);
  assert.equal(/password=/i.test(value), false);
  return value;
}

function child(script, env) {
  return new Promise((resolve, reject) => {
    const processChild = spawn(process.execPath, [script], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    processChild.stdout.on("data", value => { stdout += value; });
    processChild.stderr.on("data", value => { stderr += value; });
    processChild.once("error", reject);
    processChild.once("exit", code => resolve({ code, stdout: safe(stdout), stderr: safe(stderr) }));
  });
}

(async () => {
  const port = await availablePort();
  const env = {
    ...process.env,
    NODE_ENV: "production",
    AUTH_MODE: "production",
    STORAGE_MODE: "postgres",
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    APP_ORIGIN: "https://staging.example.invalid",
    PORT: String(port),
    LOG_LEVEL: "info"
  };

  const preflight = await child("scripts/stagingCheck.js", env);
  assert.equal(preflight.code, 0, preflight.stderr);
  const result = JSON.parse(preflight.stdout.trim());
  assert.equal(result.ok, true);
  assert.deepEqual(result.migrations, ["001", "002", "003", "004", "005", "006"]);
  assert.equal(result.archiveTables, true);

  const acceptance = await child("tests/productionAcceptance.js", env);
  assert.equal(acceptance.code, 0, acceptance.stderr || acceptance.stdout);
  assert.match(acceptance.stdout, /PASS\s+production startup/);
  console.log("PASS  staging preflight, production-like health/startup, origin, exposure, errors, restart, and shutdown");
})().catch(error => { console.error(error && error.stack ? error.stack : error.message); process.exitCode = 1; });
