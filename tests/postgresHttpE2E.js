"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const password = require("../auth/password");
const claims = require("../repositories/claimRepository");

if (!process.env.TEST_DATABASE_URL) {
  console.log("SKIP  PostgreSQL HTTP E2E: TEST_DATABASE_URL is not set");
  process.exit(0);
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const id = () => crypto.randomUUID();
const ids = { schoolA: id(), schoolB: id(), teacherA: id(), teacherB: id(), disabled: id(), studentUserA: id(), studentUserB: id(), studentA: id(), studentB: id(), unclaimed: id(), classroomA: id(), classroomB: id(), claim: id(), expired: id(), reused: id() };
const secret = { password: "Phase6-test-password!", claim: `P6${crypto.randomBytes(8).toString("hex")}`, expired: `P6${crypto.randomBytes(8).toString("hex")}`, reused: `P6${crypto.randomBytes(8).toString("hex")}` };
const unique = crypto.randomBytes(5).toString("hex");
const names = { teacherA: `phase6-a-${unique}@example.test`, teacherB: `phase6-b-${unique}@example.test`, disabled: `phase6-disabled-${unique}@example.test`, studentA: `phase6_student_a_${unique}`, studentB: `phase6_student_b_${unique}`, claimed: `phase6_claimed_${unique}`, duplicate: `phase6_duplicate_${unique}` };
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
let server;

function startServer(base, port) {
  server = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] });
}
async function stopServer() {
  if (!server || server.killed) return;
  server.kill("SIGTERM");
  await new Promise(resolve => server.once("exit", resolve));
}

function cookieOf(response) { return String(response.headers.get("set-cookie") || "").split(";")[0]; }
async function call(base, path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, { ...options, headers });
  const text = await response.text(); let body = {}; try { body = JSON.parse(text); } catch (_) {}
  assert.equal(text.includes("DATABASE_URL"), false); assert.equal(text.includes("password_hash"), false); assert.equal(text.includes("scrypt$"), false);
  return { response, body, text };
}
async function waitFor(base) { for (let i = 0; i < 60; i += 1) { try { const r = await fetch(base + "/api/status"); if (r.ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("SERVER_NOT_READY"); }
async function login(base, identifier, rawPassword, extra = {}) {
  return call(base, "/api/auth/login", { method: "POST", headers: { Origin: base }, body: JSON.stringify({ identifier, password: rawPassword, ...extra }) });
}
async function seed() {
  const hash = password.hashPassword(secret.password);
  await pool.query("INSERT INTO schools(id,name) VALUES($1,'School A'),($2,'School B')", [ids.schoolA, ids.schoolB]);
  await pool.query("INSERT INTO users(id,role,email,username,display_name,password_hash,status) VALUES ($1,'TEACHER',$2,NULL,'Teacher A',$7,'ACTIVE'),($3,'TEACHER',$4,NULL,'Teacher B',$7,'ACTIVE'),($5,'TEACHER',$6,NULL,'Disabled',$7,'DISABLED'),($8,'STUDENT',NULL,$9,'Student A',$7,'ACTIVE'),($10,'STUDENT',NULL,$11,'Student B',$7,'ACTIVE')", [ids.teacherA,names.teacherA,ids.teacherB,names.teacherB,ids.disabled,names.disabled,hash,ids.studentUserA,names.studentA,ids.studentUserB,names.studentB]);
  await pool.query("INSERT INTO students(id,user_id,display_name) VALUES($1,$2,'Student A'),($3,$4,'Student B'),($5,NULL,'Unclaimed')", [ids.studentA,ids.studentUserA,ids.studentB,ids.studentUserB,ids.unclaimed]);
  await pool.query("INSERT INTO classrooms(id,school_id,name,created_by) VALUES($1,$2,'Classroom A',$3),($4,$5,'Classroom B',$6)", [ids.classroomA,ids.schoolA,ids.teacherA,ids.classroomB,ids.schoolB,ids.teacherB]);
  await pool.query("INSERT INTO classroom_memberships(id,classroom_id,user_id,role) VALUES($1,$2,$3,'TEACHER'),($4,$2,$5,'STUDENT'),($6,$7,$8,'TEACHER'),($9,$7,$10,'STUDENT')", [id(),ids.classroomA,ids.teacherA,id(),ids.studentUserA,id(),ids.classroomB,ids.teacherB,id(),ids.studentUserB]);
  await pool.query("INSERT INTO student_claim_tokens(id,student_id,token_hash,expires_at,created_by,used_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour',$4,NULL),($5,$2,$6,NOW()-INTERVAL '1 hour',$4,NULL),($7,$2,$8,NOW()+INTERVAL '1 hour',$4,NOW())", [ids.claim,ids.unclaimed,claims.hashClaim(secret.claim),ids.teacherA,ids.expired,claims.hashClaim(secret.expired),ids.reused,claims.hashClaim(secret.reused)]);
}
async function cleanup() {
  const studentIds = [ids.studentA, ids.studentB, ids.unclaimed];
  await pool.query("DELETE FROM xp_events WHERE student_id=ANY($1::uuid[])", [studentIds]);
  await pool.query("DELETE FROM quiz_attempts WHERE student_id=ANY($1::uuid[])", [studentIds]);
  await pool.query("DELETE FROM research_activity_events WHERE student_id=ANY($1::uuid[])", [studentIds]);
  await pool.query("DELETE FROM memory_records WHERE student_id=ANY($1::uuid[])", [studentIds]);
  await pool.query("DELETE FROM classrooms WHERE id=ANY($1::uuid[])", [[ids.classroomA, ids.classroomB]]);
  await pool.query("DELETE FROM student_claim_tokens WHERE student_id=ANY($1::uuid[])", [studentIds]);
  await pool.query("DELETE FROM students WHERE id=ANY($1::uuid[])", [studentIds]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[]) OR username=$2", [[ids.teacherA, ids.teacherB, ids.disabled, ids.studentUserA, ids.studentUserB], names.claimed]);
  await pool.query("DELETE FROM schools WHERE id=ANY($1::uuid[])", [[ids.schoolA, ids.schoolB]]);
}

(async () => {
  await seed();
  const port = 32000 + crypto.randomInt(20000); const base = `http://127.0.0.1:${port}`;
  startServer(base, port);
  await waitFor(base);

  let result = await call(base, "/api/auth/session"); assert.equal(result.response.status, 200); assert.equal(result.body.authenticated, false);
  result = await login(base, names.teacherA, "wrong-password"); assert.equal(result.response.status, 401);
  result = await login(base, names.disabled, secret.password); assert.equal(result.response.status, 401); assert.equal(result.body.error.code, "ACCOUNT_DISABLED");
  result = await call(base, "/api/auth/login", { method: "POST", headers: { Origin: "https://invalid.example" }, body: JSON.stringify({ identifier: names.teacherA, password: secret.password }) }); assert.equal(result.response.status, 403);
  result = await login(base, names.teacherA, secret.password, { role: "STUDENT", userId: ids.studentUserB, studentId: ids.studentB }); assert.equal(result.response.status, 200); assert.equal(result.body.user.role, "TEACHER"); assert.equal(result.body.user.studentId, null);
  const teacherCookie = cookieOf(result.response); const setCookie = result.response.headers.get("set-cookie") || ""; assert.match(setCookie,/HttpOnly/i); assert.match(setCookie,/SameSite=Lax/i); assert.match(setCookie,/Path=\//i); assert.match(setCookie,/Secure/i); assert.ok(teacherCookie.startsWith("yd_session="));
  result = await call(base, "/api/auth/session", { headers: { Cookie: teacherCookie } }); assert.equal(result.body.authenticated, true); assert.equal(result.body.user.role, "TEACHER");
  result = await call(base, "/api/classrooms", { headers: { Cookie: teacherCookie } }); assert.equal(result.response.status, 200); assert.deepEqual(result.body.classrooms.map(x => x.id), [ids.classroomA]);
  assert.equal((await call(base, `/api/classrooms/${ids.classroomA}`, { headers: { Cookie: teacherCookie } })).response.status, 200);
  assert.equal((await call(base, `/api/classrooms/${ids.classroomB}`, { headers: { Cookie: teacherCookie } })).response.status, 403);
  assert.equal((await call(base, `/api/classrooms/${ids.classroomA}/students`, { headers: { Cookie: teacherCookie } })).response.status, 200);
  assert.equal((await call(base, `/api/classrooms/${ids.classroomB}/summary`, { headers: { Cookie: teacherCookie } })).response.status, 403);
  assert.equal((await call(base, `/api/students/${ids.studentA}`, { headers: { Cookie: teacherCookie } })).response.status, 200);
  assert.equal((await call(base, `/api/students/${ids.studentB}`, { headers: { Cookie: teacherCookie } })).response.status, 403);
  result = await call(base, `/api/students/${ids.studentA}`, { method: "PATCH", headers: { Cookie: teacherCookie, Origin: base }, body: JSON.stringify({ displayName: "Student A Updated", role: "TEACHER", userId: ids.teacherA, schoolId: ids.schoolB, classroomId: ids.classroomB, createdBy: ids.teacherB }) }); assert.equal(result.response.status, 200);
  assert.equal((await call(base, `/api/students/${ids.studentA}`, { method: "PATCH", headers: { Cookie: teacherCookie, Origin: "https://invalid.example" }, body: JSON.stringify({ displayName: "Blocked" }) })).response.status, 403);
  const unchanged = (await pool.query("SELECT user_id FROM students WHERE id=$1", [ids.studentA])).rows[0]; assert.equal(unchanged.user_id, ids.studentUserA);
  assert.equal((await call(base, `/api/progress?studentId=${ids.studentA}`, { headers: { Cookie: teacherCookie } })).response.status, 200);
  assert.equal((await call(base, `/api/progress?studentId=${ids.studentB}`, { headers: { Cookie: teacherCookie } })).response.status, 403);
  assert.equal((await call(base, `/api/teacher/summary?studentId=${ids.studentA}`, { headers: { Cookie: teacherCookie } })).response.status, 200);

  result = await login(base, names.studentA, secret.password); assert.equal(result.response.status, 200); assert.equal(result.body.user.role, "STUDENT"); assert.equal(result.body.user.studentId, ids.studentA); const studentCookie = cookieOf(result.response);
  result = await call(base, "/api/auth/session", { headers: { Cookie: studentCookie } }); assert.equal(result.body.user.studentId, ids.studentA);
  assert.equal((await call(base, "/api/progress", { headers: { Cookie: studentCookie } })).response.status, 200);
  assert.equal((await call(base, `/api/progress?studentId=${ids.studentB}&role=TEACHER&userId=${ids.teacherA}`, { headers: { Cookie: studentCookie } })).response.status, 403);
  assert.equal((await call(base, `/api/teacher/summary?studentId=${ids.studentA}`, { headers: { Cookie: studentCookie } })).response.status, 403);
  assert.equal((await call(base, `/api/research?q=Mars&studentId=${ids.studentB}&role=TEACHER`, { headers: { Cookie: studentCookie } })).response.status, 403);
  result = await call(base, "/api/memory/save", { method: "POST", headers: { Cookie: studentCookie, Origin: base }, body: JSON.stringify({ topic: "Phase 6 Memory", summary: "Owned data", studentId: ids.studentA, role: "TEACHER", userId: ids.teacherA }) }); assert.equal(result.response.status, 200); assert.equal(result.body.memory.studentId, ids.studentA);
  result = await call(base, "/api/memory/list", { headers: { Cookie: studentCookie } }); assert.equal(result.response.status, 200); assert.equal(result.body.memories.some(item => item.studentId === ids.studentA), true);
  assert.equal((await call(base, `/api/memory/list?studentId=${ids.studentB}`, { headers: { Cookie: studentCookie } })).response.status, 403);
  assert.equal((await call(base, "/api/memory/save", { method: "POST", headers: { Cookie: teacherCookie, Origin: base }, body: JSON.stringify({ topic: "Forbidden", studentId: ids.studentA }) })).response.status, 403);

  const research = { query: "Mars", structuredContent: { keyFacts: [{ text: "Mars, Güneş Sistemi'nde dördüncü sırada yer alan kayasal bir gezegendir.", concept: "Gezegen" },{ text: "Mars'ın yüzeyindeki demir oksit gezegene belirgin kızıl görünümünü verir.", concept: "Yüzey" },{ text: "Mars'ın Phobos ve Deimos adında iki küçük doğal uydusu vardır.", concept: "Uydu" },{ text: "Mars atmosferinin büyük bölümü karbondioksit gazından oluşmaktadır.", concept: "Atmosfer" }] } };
  result = await call(base, "/api/quiz/start", { method: "POST", headers: { Cookie: studentCookie, Origin: base }, body: JSON.stringify({ research, count: 3, studentId: ids.studentB }) }); assert.equal(result.response.status, 403);
  result = await call(base, "/api/quiz/start", { method: "POST", headers: { Cookie: studentCookie, Origin: base }, body: JSON.stringify({ research, count: 3 }) }); assert.equal(result.response.status, 200); const attempt = result.body.attempt;
  const studentBLogin = await login(base, names.studentB, secret.password); const studentBCookie = cookieOf(studentBLogin.response);
  assert.equal((await call(base, "/api/quiz/answer", { method: "POST", headers: { Cookie: studentBCookie, Origin: base }, body: JSON.stringify({ attemptId: attempt.attemptId, questionId: attempt.questions[0].id, answer: "x" }) })).response.status, 403);
  result = await call(base, "/api/quiz/answer", { method: "POST", headers: { Cookie: studentCookie, Origin: base }, body: JSON.stringify({ attemptId: attempt.attemptId, questionId: attempt.questions[0].id, answer: "x", role: "TEACHER" }) }); assert.equal(result.response.status, 200);
  assert.equal((await call(base, "/api/quiz/answer", { method: "POST", headers: { Cookie: studentCookie, Origin: base }, body: JSON.stringify({ attemptId: attempt.attemptId, questionId: attempt.questions[0].id, answer: "x" }) })).response.status, 409);
  result = await call(base, "/api/quiz/complete", { method: "POST", headers: { Cookie: studentCookie, Origin: base }, body: JSON.stringify({ attemptId: attempt.attemptId }) }); assert.equal(result.response.status, 200); assert.equal(result.body.duplicate, false);
  result = await call(base, "/api/quiz/complete", { method: "POST", headers: { Cookie: studentCookie, Origin: base }, body: JSON.stringify({ attemptId: attempt.attemptId }) }); assert.equal(result.response.status, 200); assert.equal(result.body.duplicate, true);
  assert.equal(Number((await pool.query("SELECT count(*) FROM xp_events WHERE attempt_id=$1", [attempt.attemptId])).rows[0].count), 1);

  result = await call(base, "/api/auth/claim", { method: "POST", headers: { Origin: base }, body: JSON.stringify({ claimCode: secret.expired, username: names.claimed, password: secret.password }) }); assert.equal(result.response.status, 400); assert.equal(result.body.error.code, "CLAIM_EXPIRED");
  result = await call(base, "/api/auth/claim", { method: "POST", headers: { Origin: base }, body: JSON.stringify({ claimCode: secret.reused, username: names.claimed, password: secret.password }) }); assert.equal(result.response.status, 400); assert.equal(result.body.error.code, "CLAIM_USED");
  assert.equal((await call(base, "/api/auth/claim", { method: "POST", headers: { Origin: base }, body: JSON.stringify({ claimCode: "wrong", username: names.claimed, password: secret.password }) })).response.status, 400);
  assert.equal((await call(base, "/api/auth/claim", { method: "POST", headers: { Origin: base }, body: JSON.stringify({ claimCode: secret.claim, username: names.studentA, password: secret.password }) })).response.status, 400);
  assert.equal((await call(base, "/api/auth/claim", { method: "POST", headers: { Origin: base }, body: JSON.stringify({ claimCode: secret.claim, username: names.claimed, password: "short", role: "TEACHER", userId: ids.teacherA, studentId: ids.studentB }) })).response.status, 400);
  result = await call(base, "/api/auth/claim", { method: "POST", headers: { Origin: base }, body: JSON.stringify({ claimCode: secret.claim, username: names.claimed, password: secret.password, role: "TEACHER", userId: ids.teacherA, studentId: ids.studentB }) }); assert.equal(result.response.status, 201); assert.equal(result.body.user.role, "STUDENT"); assert.equal(result.body.user.studentId, ids.unclaimed); const claimCookie = cookieOf(result.response);
  result = await call(base, "/api/auth/session", { headers: { Cookie: claimCookie } }); assert.equal(result.body.authenticated, true); assert.equal(result.body.user.studentId, ids.unclaimed);
  assert.equal((await pool.query("SELECT token_hash=$2 AS hashed, user_id IS NOT NULL AS linked FROM student_claim_tokens c JOIN students s ON s.id=c.student_id WHERE c.id=$1", [ids.claim, claims.hashClaim(secret.claim)])).rows[0].hashed, true);
  await stopServer(); startServer(base, port); await waitFor(base);
  assert.equal((await call(base, "/api/auth/claim", { method: "POST", headers: { Origin: base }, body: JSON.stringify({ claimCode: secret.claim, username: names.duplicate, password: secret.password }) })).response.status, 400);

  result = await call(base, "/api/auth/logout", { method: "POST", headers: { Cookie: studentCookie, Origin: base } }); assert.equal(result.response.status, 200);
  assert.equal((await call(base, "/api/progress", { headers: { Cookie: studentCookie } })).response.status, 401);
  const fresh = await login(base, names.studentB, secret.password); const disabledCookie = cookieOf(fresh.response); await pool.query("UPDATE users SET status='DISABLED' WHERE id=$1", [ids.studentUserB]); assert.equal((await call(base, "/api/progress", { headers: { Cookie: disabledCookie } })).response.status, 401);
  console.log("PASS  real PostgreSQL HTTP auth, claim, session, authorization, IDOR, quiz ownership, origin, cookie, spoofing, and cleanup checks");
})().catch(error => { console.error(error && error.stack ? error.stack : (error.code || error.message || "POSTGRES_HTTP_E2E_FAILED")); process.exitCode = 1; }).finally(async () => {
  await stopServer();
  try { await cleanup(); } finally { await pool.end(); }
});
