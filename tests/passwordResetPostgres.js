"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { Pool } = require("pg");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  password reset PostgreSQL E2E: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");
process.env.NODE_ENV = "test"; process.env.AUTH_MODE = "production"; process.env.ACCESS_MODE = "authenticated"; process.env.STORAGE_MODE = "postgres"; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const resetToken = require("../auth/resetToken");
const { CapturePasswordResetDelivery, setPasswordResetDeliveryForTests } = require("../services/passwordResetDelivery");
const delivery = new CapturePasswordResetDelivery(); setPasswordResetDeliveryForTests(delivery);
const app = require("../server");
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
const suffix = crypto.randomBytes(5).toString("hex"); const username = `reset_user_${suffix}`; const email = `reset-${suffix}@example.test`; const oldPassword = "Reset-old-password!"; const newPassword = "Reset-new-password!";
let server; let base; let userId;

async function start(port = 0) { server = http.createServer(app); await new Promise(resolve => server.listen(port, "127.0.0.1", resolve)); base = `http://127.0.0.1:${server.address().port}`; process.env.APP_ORIGIN = base; }
async function stop() { if (server?.listening) await new Promise(resolve => server.close(resolve)); }
async function call(path, method = "GET", body, cookie) { const response = await fetch(base + path, { method, headers: { Accept: "application/json", Origin: base, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) }); return { response, body: await response.json() }; }
async function login(rawPassword) { return call("/api/auth/login", "POST", { identifier: username, password: rawPassword }); }
function cookie(result) { return String(result.response.headers.get("set-cookie")).split(";")[0]; }

(async () => {
  await start();
  const registered = await call("/api/auth/register", "POST", { username, email, password: oldPassword }); assert.equal(registered.response.status, 201, JSON.stringify(registered.body)); userId = registered.body.user.id; const sessionA = cookie(registered);
  const loginB = await login(oldPassword); assert.equal(loginB.response.status, 200); const sessionB = cookie(loginB);

  const existing = await call("/api/auth/password-reset/request", "POST", { identifier: username }); const missing = await call("/api/auth/password-reset/request", "POST", { identifier: `missing_${suffix}` });
  assert.equal(existing.response.status, missing.response.status); assert.deepEqual(existing.body, missing.body); assert.equal(existing.body.token, undefined);
  const first = delivery.latest(userId); assert.ok(first?.token); const firstRow = await pool.query("SELECT token_hash,expires_at,used_at FROM password_reset_tokens WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1", [userId]);
  assert.equal(firstRow.rows[0].token_hash, resetToken.hashToken(first.token)); assert.equal(firstRow.rows[0].token_hash.includes(first.token), false); assert.ok(new Date(firstRow.rows[0].expires_at) > new Date());

  await call("/api/auth/password-reset/request", "POST", { identifier: email }); const second = delivery.latest(userId); assert.notEqual(second.token, first.token);
  assert.equal((await call("/api/auth/password-reset/complete", "POST", { token: first.token, newPassword })).response.status, 400, "previous token revoked");
  await pool.query("UPDATE password_reset_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1", [resetToken.hashToken(second.token)]);
  assert.equal((await call("/api/auth/password-reset/complete", "POST", { token: second.token, newPassword })).response.status, 400, "expired token rejected");

  await call("/api/auth/password-reset/request", "POST", { identifier: username }); const current = delivery.latest(userId);
  assert.equal((await call("/api/auth/password-reset/complete", "POST", { token: current.token, newPassword: "short", userId: crypto.randomUUID(), role: "TEACHER" })).response.status, 400);
  const completed = await call("/api/auth/password-reset/complete", "POST", { token: current.token, newPassword, userId: crypto.randomUUID(), role: "TEACHER", passwordHash: oldPassword }); assert.equal(completed.response.status, 200, JSON.stringify(completed.body)); assert.equal(completed.body.token, undefined);
  assert.equal((await call("/api/auth/session", "GET", null, sessionA)).body.authenticated, false); assert.equal((await call("/api/auth/session", "GET", null, sessionB)).body.authenticated, false);
  assert.equal((await call("/api/auth/password-reset/complete", "POST", { token: current.token, newPassword })).response.status, 400, "single use");
  assert.equal((await login(oldPassword)).response.status, 401); assert.equal((await login(newPassword)).response.status, 200);
  const dbUser = await pool.query("SELECT role,password_hash FROM users WHERE id=$1", [userId]); assert.equal(dbUser.rows[0].role, "USER"); assert.equal(dbUser.rows[0].password_hash.includes(newPassword), false);

  const port = server.address().port; await stop(); await start(port); assert.equal((await login(newPassword)).response.status, 200, "new password persists after restart");
  console.log("PASS  password reset PostgreSQL enumeration, hash, expiry, latest-only, single-use, all-session revoke, login transition, and restart");
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => {
  await stop(); try { if (userId) { await pool.query("DELETE FROM sessions WHERE user_id=$1", [userId]); await pool.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [userId]); await pool.query("DELETE FROM users WHERE id=$1", [userId]); } } finally { await pool.end(); setPasswordResetDeliveryForTests(null); }
});
