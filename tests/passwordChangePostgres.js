"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const password = require("../auth/password");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  password change PostgreSQL E2E: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
const suffix = crypto.randomBytes(5).toString("hex");
const oldPassword = "Old-password-E2E!";
const newPassword = "New-password-E2E!";
const ids = { studentUser: crypto.randomUUID(), student: crypto.randomUUID(), teacher: crypto.randomUUID() };
const names = { user: `password_user_${suffix}`, student: `password_student_${suffix}`, teacher: `password-teacher-${suffix}@example.test` };
let child;

async function wait(base) { for (let i = 0; i < 80; i += 1) { try { if ((await fetch(base + "/api/status")).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("SERVER_NOT_READY"); }
async function stop() { if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); } }
async function call(base, path, method = "GET", body, cookie) { const response = await fetch(base + path, { method, headers: { Accept: "application/json", Origin: base, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) }); return { response, body: await response.json() }; }
async function login(base, identifier, rawPassword) { return call(base, "/api/auth/login", "POST", { identifier, password: rawPassword }); }
function cookie(result) { return String(result.response.headers.get("set-cookie")).split(";")[0]; }

(async () => {
  const hash = password.hashPassword(oldPassword);
  await pool.query("INSERT INTO users(id,role,username,password_hash,status) VALUES($1,'STUDENT',$2,$3,'ACTIVE')", [ids.studentUser, names.student, hash]);
  await pool.query("INSERT INTO students(id,user_id,display_name) VALUES($1,$2,'Password Student')", [ids.student, ids.studentUser]);
  await pool.query("INSERT INTO users(id,role,email,display_name,password_hash,status) VALUES($1,'TEACHER',$2,'Password Teacher',$3,'ACTIVE')", [ids.teacher, names.teacher, hash]);
  const port = 36000 + crypto.randomInt(10000); const base = `http://127.0.0.1:${port}`;
  const start = () => spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), AUTH_MODE: "production", ACCESS_MODE: "authenticated", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] });
  child = start(); await wait(base);

  const registered = await call(base, "/api/auth/register", "POST", { username: names.user, password: oldPassword }); assert.equal(registered.response.status, 201, JSON.stringify(registered.body));
  const userId = registered.body.user.id; const sessionA = cookie(registered);
  const secondLogin = await login(base, names.user, oldPassword); assert.equal(secondLogin.response.status, 200); const sessionB = cookie(secondLogin);
  assert.equal((await call(base, "/api/auth/password", "POST", { currentPassword: "wrong-password", newPassword }, sessionA)).response.status, 401);
  assert.equal((await call(base, "/api/auth/password", "POST", { currentPassword: oldPassword, newPassword: "short" }, sessionA)).response.status, 400);
  assert.equal((await call(base, "/api/auth/password", "POST", { currentPassword: oldPassword, newPassword: oldPassword }, sessionA)).response.status, 400);
  const changed = await call(base, "/api/auth/password", "POST", { currentPassword: oldPassword, newPassword, userId: ids.teacher, role: "TEACHER", studentId: ids.student, schoolId: "spoof", passwordHash: oldPassword, status: "DISABLED" }, sessionA);
  assert.equal(changed.response.status, 200, JSON.stringify(changed.body)); assert.equal(changed.body.passwordHash, undefined);
  assert.equal((await call(base, "/api/auth/session", "GET", null, sessionA)).body.authenticated, true, "current session survives");
  assert.equal((await call(base, "/api/auth/session", "GET", null, sessionB)).body.authenticated, false, "other session revoked");
  assert.equal((await login(base, names.user, oldPassword)).response.status, 401);
  assert.equal((await login(base, names.user, newPassword)).response.status, 200);
  const persisted = await pool.query("SELECT role,password_hash FROM users WHERE id=$1", [userId]); assert.equal(persisted.rows[0].role, "USER"); assert.equal(password.verifyPassword(newPassword, persisted.rows[0].password_hash), true); assert.equal(persisted.rows[0].password_hash.includes(newPassword), false);

  for (const fixture of [{ id: ids.studentUser, identifier: names.student, role: "STUDENT" }, { id: ids.teacher, identifier: names.teacher, role: "TEACHER" }]) {
    const logged = await login(base, fixture.identifier, oldPassword); assert.equal(logged.response.status, 200); const active = cookie(logged);
    const rolePassword = `${fixture.role}-new-password!`;
    assert.equal((await call(base, "/api/auth/password", "POST", { currentPassword: oldPassword, newPassword: rolePassword, role: "USER", userId }, active)).response.status, 200);
    const row = await pool.query("SELECT role FROM users WHERE id=$1", [fixture.id]); assert.equal(row.rows[0].role, fixture.role);
    assert.equal((await login(base, fixture.identifier, rolePassword)).response.status, 200);
  }
  const linkage = await pool.query("SELECT user_id FROM students WHERE id=$1", [ids.student]); assert.equal(linkage.rows[0].user_id, ids.studentUser);

  await stop(); child = start(); await wait(base);
  assert.equal((await login(base, names.user, newPassword)).response.status, 200, "new password persists after restart");
  console.log("PASS  password change PostgreSQL multi-session, roles, linkage, hashing, login transition, and restart persistence");
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => {
  await stop();
  try {
    const rows = await pool.query("SELECT id FROM users WHERE username=ANY($1::text[]) OR email=$2", [[names.user, names.student], names.teacher]); const userIds = rows.rows.map(row => row.id);
    if (userIds.length) { await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [userIds]); await pool.query("DELETE FROM students WHERE user_id=ANY($1::uuid[])", [userIds]); await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [userIds]); }
  } finally { await pool.end(); }
});
