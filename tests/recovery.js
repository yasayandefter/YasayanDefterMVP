"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBackup, verifyBackup, restoreBackup, resolveBackup } = require("../scripts/pilotStorage");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "yasayan-recovery-"));
const backupRoot = path.join(root, "backups");
const files = { "memory.json": { state: "A" }, "yasayan_deefter_memory.json": [{ topic: "A" }], "data/classrooms.json": [{ id: "class-A" }], "data/students.json": [{ id: "student-A" }], "data/quiz-attempts.json": [{ id: "attempt-A" }] };
try {
  for (const [relative, value] of Object.entries(files)) { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(value), "utf8"); }
  const backup = createBackup({ root, backupRoot, id: "fixture-A" });
  assert.equal(verifyBackup(backup.directory).ok, true);
  for (const relative of Object.keys(files)) fs.writeFileSync(path.join(root, relative), JSON.stringify({ state: "B" }), "utf8");
  const dryRun = restoreBackup({ root, backupRoot, id: "fixture-A", dryRun: true });
  assert.equal(dryRun.dryRun, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "memory.json"), "utf8")), { state: "B" });
  const restored = restoreBackup({ root, backupRoot, id: "fixture-A" });
  assert.equal(restored.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "memory.json"), "utf8")), { state: "A" });
  assert.ok(restored.safetyBackupId);
  const beforeCorrupt = fs.readFileSync(path.join(root, "memory.json"), "utf8");
  fs.appendFileSync(path.join(backup.directory, "memory.json"), "corrupt");
  assert.throws(() => restoreBackup({ root, backupRoot, id: "fixture-A" }), /CHECKSUM_MISMATCH/);
  assert.equal(fs.readFileSync(path.join(root, "memory.json"), "utf8"), beforeCorrupt);
  fs.writeFileSync(path.join(backup.directory, "memory.json"), beforeCorrupt, "utf8");
  fs.copyFileSync(path.join(root, "yasayan_deefter_memory.json"), path.join(backup.directory, "yasayan_deefter_memory.json"));
  fs.unlinkSync(path.join(backup.directory, "data/students.json"));
  assert.throws(() => verifyBackup(backup.directory), /BACKUP_FILE_MISSING/);
  assert.throws(() => resolveBackup({ root, backupRoot, id: "../../escape" }), /INVALID_BACKUP_ID/);
  console.log("PASS  backup, manifest, checksum, dry-run, restore, safety backup, corruption, missing file, and traversal guards");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
