"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = 31000 + crypto.randomInt(10000);
const child = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, PORT: String(port), ACCESS_MODE: "local-pilot", AUTH_MODE: "local", STORAGE_MODE: "json", DATABASE_URL: "", APP_ORIGIN: "", NODE_ENV: "test" }, stdio: ["ignore", "pipe", "pipe"] });
let output = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
async function waitReady() { for (let i = 0; i < 80; i += 1) { try { const response = await fetch(`http://127.0.0.1:${port}/api/status`); if (response.ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`server not ready: ${output}`); }
async function run() {
  await waitReady();
  const status = await fetch(`http://127.0.0.1:${port}/api/status`);
  assert.equal(status.headers.get("x-content-type-options"), "nosniff");
  assert.equal(status.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(status.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(status.headers.get("cache-control"), "no-store");
  const longQuery = await fetch(`http://127.0.0.1:${port}/api/research?q=${"x".repeat(501)}`);
  const longBody = await longQuery.text(); assert.equal(longQuery.status, 400); assert.equal(longBody.includes("[object Object]"), false);
  const malformed = await fetch(`http://127.0.0.1:${port}/api/memory/save`, { method: "POST", headers: { "content-type": "application/json" }, body: "{broken" });
  const malformedBody = await malformed.text(); assert.equal(malformed.status, 400); assert.equal(malformedBody.includes("stack"), false); assert.equal(malformedBody.includes("C:\\Users\\"), false);
  const notFound = await fetch(`http://127.0.0.1:${port}/api/does-not-exist`); const notFoundBody = await notFound.text(); assert.equal(notFound.status, 404); assert.equal(notFoundBody.includes("node_modules"), false);
  for (const route of ["/backups/manifest.json", "/data/classrooms.json", "/memory.json", "/yasayan_deefter_memory.json"]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    assert.equal(response.status, 404, `public data route exposed: ${route}`);
  }
  const xss = await fetch(`http://127.0.0.1:${port}/api/research?q=${encodeURIComponent("<script>alert(1)</script>")}`); const xssBody = await xss.text(); assert.match(xss.headers.get("content-type") || "", /application\/json/); assert.equal(xssBody.includes("[object Object]"), false);
  console.log("PASS  security headers, input limits, malformed JSON, leakage, XSS, and 404 checks");
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { if (child.exitCode === null) child.kill(); });
