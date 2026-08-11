"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function readArray(file) { try { const parsed = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : []; } catch (_) { return []; } }
function masked(value) { return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12); }
function scanFiles(root) { const files = []; function walk(dir) { if (!fs.existsSync(dir)) return; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/(?:^|[_-])students?\.json(?:\.bak)?$/i.test(entry.name) || /^students\.json(?:\.bak)?$/i.test(entry.name)) files.push(file); } } walk(root); return files; }
function analyzeOrphans(root, attempts, currentStudentIds) {
  const counts = new Map(); const timestamps = new Map();
  for (const attempt of attempts) if (attempt?.studentId && !currentStudentIds.has(String(attempt.studentId))) {
    const id = String(attempt.studentId); counts.set(id, (counts.get(id) || 0) + 1);
    const rawTime = attempt.createdAt || attempt.updatedAt || attempt.timestamp;
    const time = rawTime && !Number.isNaN(Date.parse(rawTime)) ? new Date(rawTime).toISOString() : null;
    if (time) { const range = timestamps.get(id) || { from: time, to: time }; range.from = range.from < time ? range.from : time; range.to = range.to > time ? range.to : time; timestamps.set(id, range); }
  }
  const backupEvidence = new Map();
  for (const file of scanFiles(root)) for (const row of readArray(file)) if (row?.id) {
    const id = String(row.id); const signature = JSON.stringify({ classroomId: row.classroomId ?? null, userId: row.userId ?? null });
    const set = backupEvidence.get(id) || new Set(); set.add(signature); backupEvidence.set(id, set);
  }
  const recoverable = []; const consistent = []; const unresolved = []; const conflicting = []; const classifications = new Map();
  for (const [id, count] of counts) { const evidence = backupEvidence.get(id); const category = evidence?.size > 1 ? "conflicting" : evidence?.size === 1 ? "recoverable" : count > 1 ? "consistent" : "unresolved"; classifications.set(id, category); if (category === "recoverable") recoverable.push(id); else if (category === "consistent") consistent.push(id); else if (category === "conflicting") conflicting.push(id); else unresolved.push(id); }
  return { missingStudentIdCount: counts.size, affectedQuizAttemptCount: [...counts.values()].reduce((sum, value) => sum + value, 0), recoverableFromBackup: recoverable.length, consistentOrphans: consistent.length, unresolvedOrphans: unresolved.length, conflictingOrphans: conflicting.length, groups: { recoverable: recoverable.map(masked), consistent: consistent.map(masked), unresolved: unresolved.map(masked), conflicting: conflicting.map(masked) }, counts: Object.fromEntries([...counts.entries()].map(([id, count]) => [masked(id), count])), timestampRanges: Object.fromEntries([...timestamps.entries()].map(([id, range]) => [masked(id), range])), mappings: new Map([...recoverable, ...consistent].map(id => [id, id])), classifications };
}

module.exports = { analyzeOrphans, masked, scanFiles };
