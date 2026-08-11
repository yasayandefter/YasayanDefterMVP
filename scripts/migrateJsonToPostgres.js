"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { readSources, snapshotManifest } = require("../migration/jsonReaders");
const normalizers = require("../migration/normalizers");
const { emptyCounts, conflict, aggregateConflicts } = require("../migration/report");
const { analyzeOrphans } = require("../migration/orphanAnalysis");
const { buildQuarantinePlan, buildMemoryQuarantinePlan } = require("../migration/quarantine");

function sourceMap(sources) { return Object.fromEntries(sources.map(source => [source.logicalName, source])); }
function duplicateCount(rows, key) { const seen = new Set(); let count = 0; for (const row of rows) { const value = key(row); if (seen.has(value)) count += 1; else seen.add(value); } return count; }

function buildDryRun(root = process.cwd(), options = {}) {
  const capturedAt = options.capturedAt || new Date().toISOString();
  const mapLegacyDefault = options.mapLegacyDefault === true;
  const quarantineUnresolved = options.quarantineUnresolvedLegacy === true;
  const sources = readSources(root); const files = snapshotManifest(sources, capturedAt); const map = sourceMap(sources); const conflicts = [];
  for (const source of sources) if (!source.validJson) conflicts.push(conflict(source.errorCode || "INVALID_JSON", "BLOCKING"));
  const schoolId = normalizers.stableUuid("migration-tenant", "legacy-pilot-tenant");
  const legacyStudentId = normalizers.stableUuid("legacy-student", "legacy-default-profile");
  const classrooms = map.classrooms.data.map(row => normalizers.classroom(row, schoolId));
  const classIds = new Map(classrooms.map(row => [row.legacyId, row.id]));
  const students = map.students.data.map(row => normalizers.student(row, classIds.get(normalizers.text(row?.classroomId, 120)) || null));
  if (mapLegacyDefault) students.push({ id: legacyStudentId, legacyId: "legacy-default-profile", classroomId: null, userId: null, displayName: "Legacy Pilot Profile", createdAt: null, updatedAt: null });
  const studentIds = new Map(students.map(row => [row.legacyId, row.id]));
  const memberships = students.filter(row => row.classroomId).map(row => ({ studentId: row.id, classroomId: row.classroomId, userId: null, role: "STUDENT", deferred: true }));
  const orphanStudents = students.filter(row => !row.classroomId && row.legacyId !== "legacy-default-profile");
  if (orphanStudents.length) conflicts.push(conflict("STUDENT_CLASSROOM_NOT_FOUND", "BLOCKING", orphanStudents.length));
  if (students.length && mapLegacyDefault) conflicts.push(conflict("LEGACY_STUDENT_ACCOUNT_REQUIRED", "WARNING", 1));
  const orphanAnalysis = analyzeOrphans(root, map.quizAttempts.data, new Set(map.students.data.map(row => String(row?.id)).filter(Boolean)));
  const orphanMapping = new Map();
  if (options.reconcileOrphanStudents) for (const legacyId of [...orphanAnalysis.mappings.keys()]) orphanMapping.set(legacyId, normalizers.stableUuid("orphan-student", legacyId));
  for (const [legacyId, mappedId] of orphanMapping) if (!studentIds.has(legacyId)) { students.push({ id: mappedId, legacyId, classroomId: null, userId: null, displayName: `Legacy Student ${mappedId.slice(0, 8)}`, createdAt: null, updatedAt: null }); studentIds.set(legacyId, mappedId); }
  const memoryRows = []; let unassignedMemory = 0;
  for (const row of map.learning.data) { const studentId = row?.studentId ? (studentIds.get(String(row.studentId)) || orphanMapping.get(String(row.studentId))) : mapLegacyDefault ? legacyStudentId : null; if (!studentId) unassignedMemory += 1; memoryRows.push(normalizers.memory(row, studentId)); }
  const learningSnapshot = files.find(item => item.logicalName === "learning")?.sha256 || "";
  const quizSnapshot = files.find(item => item.logicalName === "quizAttempts")?.sha256 || "";
  const memoryQuarantine = quarantineUnresolved ? buildMemoryQuarantinePlan(map.learning.data, learningSnapshot, capturedAt) : { rows: [], sourceUnresolved: unassignedMemory, archivePlanned: 0, dropped: 0, duplicateCount: 0 };
  if (unassignedMemory && !quarantineUnresolved) conflicts.push(conflict("UNASSIGNED_LEGACY_MEMORY", "WARNING", unassignedMemory));
  const attempts = []; const questions = []; const answers = []; const xp = [];
  const unresolvedIds = new Set([...orphanAnalysis.classifications.entries()].filter(([, category]) => category === "unresolved").map(([id]) => id));
  const quizQuarantine = quarantineUnresolved ? buildQuarantinePlan(map.quizAttempts.data, unresolvedIds, quizSnapshot, capturedAt) : { rows: [], sourceUnresolved: unresolvedIds.size, archivePlanned: 0, dropped: 0, duplicateCount: 0 };
  for (const row of map.quizAttempts.data) {
    const legacyId = row?.studentId ? String(row.studentId) : null; const quarantined = quarantineUnresolved && legacyId && unresolvedIds.has(legacyId); const studentId = row?.studentId ? (studentIds.get(legacyId) || orphanMapping.get(legacyId)) : mapLegacyDefault ? legacyStudentId : null; const attempt = normalizers.attempt(row, quarantined ? null : studentId); if (!studentId && !quarantined) conflicts.push(conflict("QUIZ_STUDENT_NOT_FOUND", "BLOCKING")); attempts.push(attempt);
    for (const [index, question] of attempt.questions.entries()) { const questionId = normalizers.stableUuid("question", `${attempt.id}:${question.id || index}`); questions.push({ id: questionId, attemptId: attempt.id, ordinal: index, legacyId: normalizers.text(question?.id || index, 120) }); }
    const questionMap = new Map(questions.filter(item => item.attemptId === attempt.id).map(item => [item.legacyId, item.id]));
    for (const answer of attempt.answers) { const questionId = questionMap.get(normalizers.text(answer?.questionId, 120)); if (!questionId) conflicts.push(conflict("QUIZ_ANSWER_QUESTION_NOT_FOUND", "BLOCKING")); answers.push({ attemptId: attempt.id, questionId: questionId || null }); }
    if (attempt.status === "COMPLETED" && attempt.xpAwarded > 0) xp.push({ attemptId: attempt.id, amount: attempt.xpAwarded });
  }
  const duplicateConflicts = [
    ["DUPLICATE_CLASSROOM_ID", duplicateCount(map.classrooms.data, row => row?.id)],
    ["DUPLICATE_STUDENT_ID", duplicateCount(map.students.data, row => row?.id)],
    ["DUPLICATE_MEMORY_TOPIC", duplicateCount(memoryRows, row => `${row.studentId || "unassigned"}:${row.normalizedTopic}`)],
    ["DUPLICATE_QUIZ_ATTEMPT_ID", duplicateCount(attempts, row => row.legacyId)],
    ["DUPLICATE_QUIZ_ANSWER", duplicateCount(answers, row => `${row.attemptId}:${row.questionId}`)],
    ["DUPLICATE_XP_ATTEMPT", duplicateCount(xp, row => row.attemptId)]
  ];
  for (const [code, count] of duplicateConflicts) if (count) conflicts.push(conflict(code, "WARNING", count));
  const target = emptyCounts(); target.schools = classrooms.length ? 1 : 0; target.classrooms = classrooms.length; target.students = students.length; target.memberships = 0; target.memoryRecords = memoryRows.filter(row => row.studentId).length; target.quizAttempts = attempts.filter(row => row.studentId).length; target.quizQuestions = questions.filter(row => attempts.find(attempt => attempt.id === row.attemptId)?.studentId).length; target.quizAnswers = answers.filter(row => row.questionId && attempts.find(attempt => attempt.id === row.attemptId)?.studentId).length; target.xpEvents = xp.filter(row => attempts.find(attempt => attempt.id === row.attemptId)?.studentId).length;
  const sourceCounts = { classrooms: map.classrooms.recordCount, students: map.students.recordCount, memory: map.learning.recordCount, quizAttempts: map.quizAttempts.recordCount, quizQuestions: map.quizAttempts.data.reduce((sum, row) => sum + normalizers.attempt(row).questions.length, 0), quizAnswers: map.quizAttempts.data.reduce((sum, row) => sum + normalizers.attempt(row).answers.length, 0) };
  const blocking = conflicts.filter(item => item.severity === "BLOCKING").reduce((sum, item) => sum + item.count, 0); const warnings = conflicts.filter(item => item.severity === "WARNING").reduce((sum, item) => sum + item.count, 0);
  const quarantine = { enabled: quarantineUnresolved, reasonCode: "UNRESOLVED_LEGACY_STUDENT", sourceUnresolved: quizQuarantine.sourceUnresolved, archivePlanned: quizQuarantine.archivePlanned, archiveDuplicates: quizQuarantine.duplicateCount, quarantinedMemory: memoryQuarantine.archivePlanned, droppedRecords: quizQuarantine.dropped + memoryQuarantine.dropped, archiveIds: quizQuarantine.rows.map(row => row.id), memoryArchiveIds: memoryQuarantine.rows.map(row => row.id), confirmRequired: true, payloadIncludedInReport: false };
  return { version: "migration-dry-run-v1", mode: "DRY_RUN", capturedAt, sourceRoot: "project-root", snapshot: files, sourceCounts, targetCounts: { ...target, legacyArchiveAttempts: quarantine.archivePlanned, legacyArchiveMemory: quarantine.quarantinedMemory }, reconciliation: { classroomsToClassrooms: classrooms.length, studentsToStudents: students.length, deferredMemberships: memberships.length, assignedMemory: target.memoryRecords, unassignedMemory, quizAttempts: target.quizAttempts, quizQuestions: target.quizQuestions, quizAnswers: target.quizAnswers, xpEvents: target.xpEvents }, orphanStudentAnalysis: { ...orphanAnalysis, mappings: undefined, classifications: undefined }, ownership: { enabled: mapLegacyDefault, strategy: mapLegacyDefault ? "map_to_legacy_student" : "none", legacyStudentId: mapLegacyDefault ? legacyStudentId : null, mappedMemoryCount: mapLegacyDefault ? unassignedMemory : 0, mappedQuizAttemptCount: mapLegacyDefault ? map.quizAttempts.data.filter(row => !row?.studentId).length : 0, createsUser: false, userId: null, classroomCreated: false }, orphanReconciliation: { enabled: options.reconcileOrphanStudents === true, strategy: options.reconcileOrphanStudents ? "map_safe_recoverable_or_consistent_orphans" : "none", mappedOrphanStudents: orphanMapping.size, mappedQuizAttempts: map.quizAttempts.data.filter(row => row?.studentId && orphanMapping.has(String(row.studentId))).length, createsUser: false, userId: null, classroomCreated: false }, quarantine, mapping: { school: { logicalId: "legacy-pilot-tenant", deterministicId: schoolId }, classrooms: classrooms.length, students: students.length, attempts: attempts.length }, importOrder: ["migration-tenant metadata", "classrooms", "students", "memberships after account claim", "memory_records", "quiz_attempts", "quiz_attempt_questions", "quiz_attempt_answers", "xp_events", "legacy quarantine archive"], conflicts: aggregateConflicts(conflicts), blockingConflicts: blocking, warnings, migrationPlanValid: blocking === 0, apply: { supported: false, reason: "APPLY_DISABLED_IN_PHASE_4", safeguards: ["--apply", "--snapshot-hash", "--confirm", "--confirm-legacy-owner", "--confirm-orphan-reconciliation", "--quarantine-unresolved-legacy", "--confirm-quarantine"] }, transactionPlan: "Future apply should use one transaction for pilot-sized data or bounded domain batches for larger datasets.", database: { used: false, testDatabaseOnly: true }, security: { absolutePaths: false, contentIncluded: false, credentialsIncluded: false } };
}

function writeReport(report, outputDir = path.join(process.cwd(), "migration-reports")) { fs.mkdirSync(outputDir, { recursive: true }); const filename = `${report.capturedAt.replace(/[^0-9]/g, "").slice(0, 14)}-dry-run.json`; const file = path.join(outputDir, filename); fs.writeFileSync(file, JSON.stringify(report, null, 2), "utf8"); return file; }
function cli(argv = process.argv.slice(2)) { if (argv.includes("--apply")) throw new Error("APPLY_DISABLED_IN_PHASE_4"); const rootArg = argv.find(value => value.startsWith("--root=")); const root = rootArg ? path.resolve(rootArg.slice(7)) : process.cwd(); const report = buildDryRun(root, { mapLegacyDefault: argv.includes("--map-legacy-default"), reconcileOrphanStudents: argv.includes("--reconcile-orphan-students"), quarantineUnresolvedLegacy: argv.includes("--quarantine-unresolved-legacy") }); const file = writeReport(report); process.stdout.write(JSON.stringify({ ok: true, mode: report.mode, ownershipMapping: report.ownership.enabled, orphanReconciliation: report.orphanReconciliation.enabled, quarantine: report.quarantine.enabled, migrationPlanValid: report.migrationPlanValid, blockingConflicts: report.blockingConflicts, warnings: report.warnings, reportFile: path.relative(process.cwd(), file).replace(/\\/g, "/") }) + "\n"); }

if (require.main === module) { try { cli(); } catch (error) { process.stderr.write(JSON.stringify({ ok: false, code: error.message || "MIGRATION_FAILED", message: "Migration dry-run çalıştırılamadı." }) + "\n"); process.exitCode = 1; } }
module.exports = { buildDryRun, writeReport, stableMapping: normalizers.stableUuid };
