"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildDryRun } = require("../scripts/migrateJsonToPostgres");

function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value), "utf8"); }
function checksum(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), "yasayan-migration-"));
write(path.join(root, "memory.json"), []);
write(path.join(root, "yasayan_deefter_memory.json"), [
  { id: "memory-1", studentId: "student-1", topic: "Mars", title: "Mars", summary: "summary" },
  { id: "memory-2", studentId: "student-1", topic: "Mars", title: "Mars" },
  { id: "memory-unassigned", topic: "Legacy", title: "Legacy" }
]);
write(path.join(root, "data", "classrooms.json"), [
  { id: "class-1", name: "A" }, { id: "class-2", name: "B" }
]);
write(path.join(root, "data", "students.json"), [
  { id: "student-1", displayName: "Ada", classroomId: "class-1" },
  { id: "student-2", displayName: "Bora", classroomId: "class-2" },
  { id: "student-orphan", displayName: "Orphan", classroomId: "missing-class" }
]);
write(path.join(root, "data", "quiz-attempts.json"), { version: 1, data: [
  { id: "attempt-1", studentId: "student-1", completed: true, xpAwarded: 10, quiz: { topic: "Mars", questions: [{ id: "q1", prompt: "p" }] }, answers: [{ questionId: "q1" }, { questionId: "q1" }] },
  { id: "attempt-orphan", studentId: "missing-student", quiz: { questions: [] }, answers: [] }
] });

const sourceFile = path.join(root, "yasayan_deefter_memory.json");
const before = checksum(sourceFile);
const first = buildDryRun(root, { capturedAt: "2026-01-01T00:00:00.000Z" });
const second = buildDryRun(root, { capturedAt: "2026-01-01T00:00:00.000Z" });
assert.deepEqual(first.snapshot, second.snapshot);
assert.deepEqual(first.targetCounts, second.targetCounts);
assert.equal(first.snapshot.find(item => item.logicalName === "learning").sha256, before);
assert.ok(first.blockingConflicts > 0);
assert.ok(first.conflicts.some(item => item.code === "UNASSIGNED_LEGACY_MEMORY"));
assert.ok(first.conflicts.some(item => item.code === "STUDENT_CLASSROOM_NOT_FOUND"));
assert.ok(first.conflicts.some(item => item.code === "DUPLICATE_MEMORY_TOPIC"));
assert.equal(checksum(sourceFile), before);
assert.notEqual(buildDryRun(root, { capturedAt: "2026-01-02T00:00:00.000Z" }).snapshot[0].capturedAt, first.snapshot[0].capturedAt);
console.log("PASS  migration normalization, counts, orphan/duplicate/default-memory, deterministic mapping, checksum, and immutability checks");
