"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  learning streak: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.STORAGE_MODE = "postgres";

const migrations = require("../db/migrate");
const activity = require("../repositories/learningActivityRepository");
const repositories = require("../repositories");
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
const id = () => crypto.randomUUID();
const ids = { userA: id(), userB: id(), studentUserA: id(), studentUserB: id(), studentA: id(), studentB: id() };
const userA = { kind: "user", id: ids.userA }; const userB = { kind: "user", id: ids.userB };
const NOW = new Date("2026-08-12T09:00:00.000Z");

async function clearScope(scope) { const column = scope?.kind === "user" ? "owner_user_id" : "student_id"; const value = scope?.id || scope; await pool.query(`DELETE FROM xp_events WHERE ${column}=$1`, [value]); await pool.query(`DELETE FROM quiz_attempts WHERE ${column}=$1`, [value]); await pool.query(`DELETE FROM research_activity_events WHERE ${column}=$1`, [value]); }
async function research(scope, at, eventId = id()) { return activity.recordResearch({ id: eventId, studentId: scope, topic: "Fixture", completedAt: at }, pool); }
async function quiz(scope, at) { const ownerUserId = scope?.kind === "user" ? scope.id : null; const studentId = ownerUserId ? null : scope; await pool.query("INSERT INTO quiz_attempts (id,student_id,owner_user_id,topic,difficulty,question_type,status,completed_at) VALUES($1,$2,$3,'Fixture','medium','multiple-choice','COMPLETED',$4)", [id(), studentId, ownerUserId, at]); }
async function metrics(scope) { return activity.getMetrics(scope, NOW, pool); }

(async () => {
  await migrations.migrate();
  await pool.query("INSERT INTO users(id,role,username,display_name,password_hash,status) VALUES($1,'USER',$2,'A','fixture','ACTIVE'),($3,'USER',$4,'B','fixture','ACTIVE'),($5,'STUDENT',$6,'SA','fixture','ACTIVE'),($7,'STUDENT',$8,'SB','fixture','ACTIVE')", [ids.userA,`streak_a_${ids.userA}`,ids.userB,`streak_b_${ids.userB}`,ids.studentUserA,`streak_sa_${ids.studentA}`,ids.studentUserB,`streak_sb_${ids.studentB}`]);
  await pool.query("INSERT INTO students(id,user_id,display_name) VALUES($1,$2,'A'),($3,$4,'B')", [ids.studentA,ids.studentUserA,ids.studentB,ids.studentUserB]);

  let result = await metrics(userA); assert.deepEqual(result.streak, { current: 0, activeToday: false, lastActiveDate: null }); assert.equal(result.weeklyGoal.completed, 0); assert.equal(result.weeklyGoal.target, 5);
  await research(userA, "2026-08-11T07:00:00Z"); result = await metrics(userA); assert.equal(result.streak.current, 1); assert.equal(result.streak.activeToday, false); assert.equal(result.weeklyGoal.completed, 1);
  await research(userA, "2026-08-11T08:00:00Z"); await research(userA, "2026-08-11T09:00:00Z"); result = await metrics(userA); assert.equal(result.streak.current, 1); assert.equal(result.weeklyGoal.completed, 3);
  await clearScope(userA); await quiz(userA, "2026-08-12T08:00:00Z"); result = await metrics(userA); assert.equal(result.streak.current, 1); assert.equal(result.streak.activeToday, true); assert.equal(result.weeklyGoal.completed, 0);
  await quiz(userA, "2026-08-11T08:00:00Z"); result = await metrics(userA); assert.equal(result.streak.current, 2);
  await clearScope(userA); await research(userA, "2026-08-12T08:00:00Z"); await research(userA, "2026-08-10T08:00:00Z"); result = await metrics(userA); assert.equal(result.streak.current, 1);
  await clearScope(userA); await research(userA, "2026-08-09T20:59:00Z"); await research(userA, "2026-08-09T21:01:00Z"); result = await metrics(userA); assert.equal(result.weeklyGoal.completed, 1); assert.equal(result.weeklyGoal.weekStart, "2026-08-10"); assert.equal(result.weeklyGoal.weekEnd, "2026-08-17");
  await clearScope(userA); await research(userA, "2026-08-11T20:59:00Z"); await research(userA, "2026-08-11T21:01:00Z"); result = await metrics(userA); assert.equal(result.streak.current, 2); assert.equal(result.streak.lastActiveDate, "2026-08-12");
  const duplicateId = id(); await clearScope(userA); assert.equal((await research(userA, "2026-08-12T08:00:00Z", duplicateId)).recorded, true); assert.equal((await research(userA, "2026-08-12T08:00:00Z", duplicateId)).recorded, false); assert.equal((await metrics(userA)).weeklyGoal.completed, 1); assert.equal((await metrics(userB)).weeklyGoal.completed, 0);
  await research(ids.studentA, "2026-08-12T08:00:00Z"); assert.equal((await metrics(ids.studentA)).streak.current, 1); assert.equal((await metrics(ids.studentB)).streak.current, 0);
  assert.equal(repositories.jsonRepositories().learningActivity, null);
  console.log("PASS  authoritative streak, weekly target, Istanbul boundaries, idempotency, user/student isolation, quiz-only activity, and public no-persistence contract");
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => {
  try { await clearScope(userA); await clearScope(userB); await clearScope(ids.studentA); await clearScope(ids.studentB); await pool.query("DELETE FROM students WHERE id=ANY($1::uuid[])", [[ids.studentA,ids.studentB]]); await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [[ids.userA,ids.userB,ids.studentUserA,ids.studentUserB]]); }
  finally { await pool.end(); await require("../db").closePool(); }
});
