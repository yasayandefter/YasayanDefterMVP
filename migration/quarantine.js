"use strict";

const normalizers = require("./normalizers");

const REASON_CODE = "UNRESOLVED_LEGACY_STUDENT";
const PRIVATE_KEY = /password|passwd|secret|token|authorization|cookie|session|api[-_]?key|email|username/i;

function sanitize(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return typeof value === "string" ? value.slice(0, 10000) : value;
  if (Array.isArray(value)) return value.slice(0, 200).map(item => sanitize(item, depth + 1));
  const result = {};
  for (const [key, item] of Object.entries(value)) if (!PRIVATE_KEY.test(key)) result[key] = sanitize(item, depth + 1);
  return result;
}

function buildQuarantinePlan(attempts, unresolvedIds, snapshotHash, capturedAt) {
  const ids = new Set(unresolvedIds); const seen = new Set(); const rows = [];
  for (const row of attempts) {
    const legacyStudentReference = row?.studentId ? String(row.studentId) : null;
    if (!legacyStudentReference || !ids.has(legacyStudentReference)) continue;
    const legacyAttemptId = String(row?.id || ""); const unique = `${snapshotHash}:${legacyAttemptId}`;
    if (seen.has(unique)) continue;
    seen.add(unique);
    rows.push({ id: normalizers.stableUuid("legacy-quarantine", unique), legacyAttemptId, legacyStudentReference, snapshotHash, payload: sanitize(row), reasonCode: REASON_CODE, importedAt: capturedAt });
  }
  return { rows, sourceUnresolved: attempts.filter(row => row?.studentId && ids.has(String(row.studentId))).length, archivePlanned: rows.length, dropped: 0, duplicateCount: Math.max(0, attempts.filter(row => row?.studentId && ids.has(String(row.studentId))).length - rows.length) };
}

function buildMemoryQuarantinePlan(rows, snapshotHash, capturedAt) {
  const unassigned = rows.filter(row => !row?.studentId); const seen = new Set(); const archived = [];
  for (const row of unassigned) { const legacyId = String(row?.id || ""); const unique = `${snapshotHash}:${legacyId}`; if (seen.has(unique)) continue; seen.add(unique); archived.push({ id: normalizers.stableUuid("legacy-memory-quarantine", unique), legacyRecordId: legacyId, snapshotHash, payload: sanitize(row), reasonCode: "UNASSIGNED_LEGACY_MEMORY", importedAt: capturedAt }); }
  return { rows: archived, sourceUnresolved: unassigned.length, archivePlanned: archived.length, dropped: 0, duplicateCount: Math.max(0, unassigned.length - archived.length) };
}

module.exports = { REASON_CODE, sanitize, buildQuarantinePlan, buildMemoryQuarantinePlan };
