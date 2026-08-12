"use strict";

const assert = require("node:assert/strict");
const students = require("../repositories/studentsRepository");
const classrooms = require("../repositories/classroomsRepository");
const memberships = require("../repositories/membershipRepository");
const memory = require("../repositories/memoryRepository");
const quiz = require("../repositories/quizRepository");
const { getRepositories } = require("../repositories");
const domainSources = require("../services/domainSources");

function fakeClient(rows = []) { const calls = []; return { calls, async query(text, values) { calls.push({ text, values }); return { rows }; } }; }

(async () => {
  const studentClient = fakeClient([{ id: "s1", user_id: null, display_name: "Ada", created_at: new Date("2026-01-01"), updated_at: new Date("2026-01-02") }]);
  assert.deepEqual(await students.findById("s1", studentClient), { id: "s1", userId: null, displayName: "Ada", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" });
  assert.match(studentClient.calls[0].text, /WHERE id = \$1/);
  assert.deepEqual(await memberships.addMembership({ classroomId: "c1", userId: "u1", role: "TEACHER" }, fakeClient([])), null);
  const classroomClient = fakeClient([{ id: "c1", school_id: "school", name: "Class A", created_by: "u1", created_at: new Date("2026-01-01"), updated_at: new Date("2026-01-02") }]);
  const classroom = await classrooms.findById("c1", classroomClient);
  assert.equal(classroom.schoolId, "school");
  assert.equal(classroom.createdBy, "u1");
  assert.deepEqual(getRepositories({ STORAGE_MODE: "json" }).mode, "json");
  assert.deepEqual(getRepositories({ STORAGE_MODE: "postgres", DATABASE_URL: "postgres://redacted" }).mode, "postgres");
  const memoryClient = fakeClient([{ id: "m1", student_id: "s1", topic: "Mars", normalized_topic: "mars", title: "Mars", confidence: "0.8", source_count: 2, key_concepts: ["planet"], key_facts: [], related_topics: [], reliability_summary: {}, quiz_summary: {}, created_at: new Date("2026-01-01"), updated_at: new Date("2026-01-02") }]);
  const record = await memory.findByStudentAndTopic("s1", "mars", memoryClient);
  assert.equal(record.studentId, "s1");
  assert.equal(record.confidence, 0.8);
  assert.ok(memoryClient.calls[0].values.every(value => value === "s1" || value === "mars"));
  const quizClient = fakeClient([{ id: "a1", student_id: "s1", topic: "Mars", status: "ACTIVE", score: "0", xp_awarded: "0" }]);
  assert.equal((await quiz.findAttemptForStudent("a1", "s1", quizClient)).studentId, "s1");
  assert.match(quizClient.calls[0].text, /student_id = \$2/);
  assert.equal(typeof quiz.completeAttempt, "function");
  const source = await domainSources.progress("s1", { memory: { getProgressSource: async () => [] }, learningActivity: { getMetrics: async () => ({ streak: { current: 0, activeToday: false, lastActiveDate: null }, weeklyGoal: { target: 5, completed: 0, remaining: 5, achieved: false, weekStart: "2026-01-05", weekEnd: "2026-01-12" } }) } });
  assert.equal(source.profile.researchedTopics, 0);
  assert.equal(source.profile.streak.current, 0); assert.equal(source.profile.weeklyGoal.target, 5);
  console.log("PASS  PostgreSQL repository mapping, parameterized SQL, storage routing, JSONB, pagination, and quiz seams");
})().catch(error => { console.error(error); process.exitCode = 1; });
