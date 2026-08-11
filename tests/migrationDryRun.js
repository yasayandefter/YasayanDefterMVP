"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildDryRun } = require("../scripts/migrateJsonToPostgres");
const { analyzeOrphans } = require("../migration/orphanAnalysis");

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
  { id: "attempt-orphan", quiz: { questions: [] }, answers: [] }
] });

const sourceFile = path.join(root, "yasayan_deefter_memory.json");
const before = checksum(sourceFile);
const orphanAnalysis = analyzeOrphans(root, [{ studentId: "orphan-a" }, { studentId: "orphan-a" }, { studentId: "orphan-b" }], new Set(["student-1"]));
assert.equal(orphanAnalysis.missingStudentIdCount, 2);
assert.equal(orphanAnalysis.consistentOrphans, 1);
assert.equal(orphanAnalysis.unresolvedOrphans, 1);
const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yasayan-orphan-evidence-"));
write(path.join(evidenceRoot, "data", "students.json.bak"), [{ id: "orphan-recovered", classroomId: null, userId: null }, { id: "orphan-conflict", classroomId: "class-a" }, { id: "orphan-conflict", classroomId: "class-b" }]);
const evidenceAnalysis = analyzeOrphans(evidenceRoot, [{ studentId: "orphan-recovered" }, { studentId: "orphan-consistent" }, { studentId: "orphan-consistent" }, { studentId: "orphan-unresolved" }, { studentId: "orphan-conflict" }], new Set());
assert.equal(evidenceAnalysis.recoverableFromBackup, 1);
assert.equal(evidenceAnalysis.consistentOrphans, 1);
assert.equal(evidenceAnalysis.unresolvedOrphans, 1);
assert.equal(evidenceAnalysis.conflictingOrphans, 1);
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
const mapped = buildDryRun(root, { capturedAt: "2026-01-01T00:00:00.000Z", mapLegacyDefault: true });
assert.equal(mapped.ownership.enabled, true);
assert.equal(mapped.ownership.createsUser, false);
assert.equal(mapped.targetCounts.students, 4);
assert.equal(mapped.targetCounts.memoryRecords, 3);
assert.equal(mapped.targetCounts.quizAttempts, 2);
assert.equal(mapped.conflicts.some(item => item.code === "QUIZ_STUDENT_NOT_FOUND"), false);
assert.equal(mapped.conflicts.some(item => item.code === "UNASSIGNED_LEGACY_MEMORY"), false);
assert.equal(mapped.ownership.legacyStudentId, buildDryRun(root, { capturedAt: "2026-01-01T00:00:00.000Z", mapLegacyDefault: true }).ownership.legacyStudentId);
const quarantineRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yasayan-quarantine-"));
fs.cpSync(root, quarantineRoot, { recursive: true });
const quarantineFile = path.join(quarantineRoot, "data", "quiz-attempts.json");
const quarantineSource = JSON.parse(fs.readFileSync(quarantineFile, "utf8"));
quarantineSource.data.push({ id: "attempt-unresolved", studentId: "missing-student", completed: true, xpAwarded: 99, quiz: { topic: "Hidden", questions: [{ id: "q-hidden", prompt: "p" }] }, answers: [{ questionId: "q-hidden" }] });
write(quarantineFile, quarantineSource);
const noQuarantine = buildDryRun(quarantineRoot, { mapLegacyDefault: true, reconcileOrphanStudents: true, capturedAt: "2026-01-03T00:00:00.000Z" });
const withQuarantine = buildDryRun(quarantineRoot, { mapLegacyDefault: true, reconcileOrphanStudents: true, quarantineUnresolvedLegacy: true, capturedAt: "2026-01-03T00:00:00.000Z" });
assert.ok(noQuarantine.blockingConflicts > 0);
assert.equal(withQuarantine.quarantine.archivePlanned, 1);
assert.equal(withQuarantine.quarantine.droppedRecords, 0);
assert.equal(withQuarantine.targetCounts.legacyArchiveAttempts, 1);
assert.equal(withQuarantine.targetCounts.quizAttempts, noQuarantine.targetCounts.quizAttempts);
assert.equal(withQuarantine.targetCounts.xpEvents, noQuarantine.targetCounts.xpEvents);
assert.equal(withQuarantine.migrationPlanValid, noQuarantine.migrationPlanValid);
assert.deepEqual(withQuarantine.quarantine.archiveIds, buildDryRun(quarantineRoot, { mapLegacyDefault: true, reconcileOrphanStudents: true, quarantineUnresolvedLegacy: true, capturedAt: "2026-01-03T00:00:00.000Z" }).quarantine.archiveIds);
assert.equal(Object.prototype.hasOwnProperty.call(withQuarantine.quarantine, "payload"), false);
const memoryQuarantine = buildDryRun(quarantineRoot, { quarantineUnresolvedLegacy: true, capturedAt: "2026-01-03T00:00:00.000Z" });
assert.equal(memoryQuarantine.quarantine.quarantinedMemory, 1);
assert.equal(memoryQuarantine.targetCounts.memoryRecords, 2);
console.log("PASS  migration normalization, counts, orphan/duplicate/default-memory, deterministic mapping, checksum, and immutability checks");
