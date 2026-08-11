"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const port = 37000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const files = ["memory.json", "yasayan_deefter_memory.json", "data/quiz-attempts.json"].map(file => path.join(root, file));
const hash = file => fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
const before = Object.fromEntries(files.map(file => [file, hash(file)]));
const readOnlyRoot = path.join(path.parse(root).root, "var", "task", "yasayan-defter");
const trap = path.join(root, "tests", "helpers", "vercelReadOnlyTrap.js");
const env = {
  ...process.env,
  PORT: String(port),
  VERCEL: "1",
  NODE_ENV: "production",
  ACCESS_MODE: "public-demo",
  AUTH_MODE: "production",
  STORAGE_MODE: "postgres",
  DATABASE_URL: "",
  APP_ORIGIN: ""
};
let child;

function trappedEnv(overrides = {}) {
  return {
    ...env,
    YASAYAN_MEMORY_FILE: path.join(readOnlyRoot, "memory.json"),
    YASAYAN_LEARNING_MEMORY_FILE: path.join(readOnlyRoot, "learning.json"),
    YASAYAN_CLASSROOM_DATA_DIR: path.join(readOnlyRoot, "data"),
    YASAYAN_QUIZ_ATTEMPTS_FILE: path.join(readOnlyRoot, "data", "quiz-attempts.json"),
    VERCEL_READONLY_ROOT: readOnlyRoot,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${trap}`.trim(),
    ...overrides
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${base}/api/status`)).status === 200) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("VERCEL_PUBLIC_SERVER_NOT_READY");
}

(async () => {
  const importCases = [
    trappedEnv({ ACCESS_MODE: "", AUTH_MODE: "", STORAGE_MODE: "", DATABASE_URL: "", APP_ORIGIN: "", VERCEL: "" }),
    trappedEnv({ ACCESS_MODE: "", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: "", APP_ORIGIN: "", VERCEL: "" }),
    trappedEnv({ ACCESS_MODE: "public-demo" })
  ];
  for (const importEnv of importCases) {
    const imported = spawnSync(process.execPath, ["-e", "require('./api/index.js')"], { cwd: root, env: importEnv, encoding: "utf8" });
    assert.equal(imported.status, 0, imported.stderr || "serverless import failed");
  }

  child = spawn(process.execPath, ["tests/helpers/vercelApiRunner.js"], { cwd: root, env: trappedEnv(), stdio: ["ignore", "pipe", "pipe", "ipc"] });
  await waitForServer();

  const statusResponse = await fetch(`${base}/api/status`);
  const status = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.equal(status.ok, true);
  assert.equal(status.accessMode, "public-demo");
  assert.equal(status.storageMode, "ephemeral");
  assert.equal(status.researchAvailable, true);

  const sessionResponse = await fetch(`${base}/api/auth/session`);
  const session = await sessionResponse.json();
  assert.equal(sessionResponse.status, 200);
  assert.equal(session.authenticated, false);

  const researchResponse = await fetch(`${base}/api/research?q=${encodeURIComponent("atatürk")}`);
  const research = await researchResponse.json();
  assert.equal(researchResponse.status, 200);
  assert.equal(research.ok, true);
  assert.ok(String(research.summary || research.text || research.title || "").length > 0);

  const protectedResponse = await fetch(`${base}/api/progress`);
  assert.equal(protectedResponse.status, 401);
  assert.deepEqual(Object.fromEntries(files.map(file => [file, hash(file)])), before);
  child.send("close");
  const exitCode = await new Promise(resolve => child.once("exit", resolve));
  child = null;
  assert.equal(exitCode, 0, "read-only filesystem trap observed a persistent filesystem call");
  console.log("PASS  Vercel public-demo import, status, session, research, protection, no-DB, and mkdir/read/write trap=0");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
});
