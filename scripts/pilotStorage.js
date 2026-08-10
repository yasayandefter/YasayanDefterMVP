"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const INVENTORY = Object.freeze([
  { logicalName: "main-memory", relativePath: "memory.json", required: true },
  { logicalName: "learning-memory", relativePath: "yasayan_deefter_memory.json", required: true },
  { logicalName: "classrooms", relativePath: "data/classrooms.json", required: false },
  { logicalName: "students", relativePath: "data/students.json", required: false },
  { logicalName: "quiz-attempts", relativePath: "data/quiz-attempts.json", required: false }
]);
const VERSION = 1;
const BACKUP_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

function checksum(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function parseJSON(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function safeRelative(relativePath) { return typeof relativePath === "string" && !path.isAbsolute(relativePath) && !relativePath.split(/[\\/]+/).includes("..") && /^[A-Za-z0-9._/-]+$/.test(relativePath); }
function appVersion(root) {
  try { return String(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version || "unknown"); } catch (_) { return "unknown"; }
}
function inventory(root) {
  const files = [];
  for (const item of INVENTORY) {
    const target = path.join(root, item.relativePath);
    if (!fs.existsSync(target)) {
      if (item.required) throw new Error(`REQUIRED_FILE_MISSING:${item.relativePath}`);
      continue;
    }
    let validJson = true;
    try { parseJSON(target); } catch (_) { validJson = false; }
    if (!validJson) throw new Error(`INVALID_JSON:${item.relativePath}`);
    files.push({ logicalName: item.logicalName, relativePath: item.relativePath, sizeBytes: fs.statSync(target).size, checksum: checksum(target), validJson: true, required: item.required });
    const backup = `${target}.bak`;
    if (fs.existsSync(backup)) {
      let backupValid = true;
      try { parseJSON(backup); } catch (_) { backupValid = false; }
      if (!backupValid) throw new Error(`INVALID_JSON:${item.relativePath}.bak`);
      files.push({ logicalName: `${item.logicalName}-backup`, relativePath: `${item.relativePath}.bak`, sizeBytes: fs.statSync(backup).size, checksum: checksum(backup), validJson: true, required: false });
    }
  }
  return files;
}
function backupDirectory(backupRoot, id) {
  const value = id || new Date().toISOString().replace(/[:.]/g, "-");
  if (!BACKUP_ID.test(value)) throw new Error("INVALID_BACKUP_ID");
  const root = path.resolve(backupRoot);
  const target = path.resolve(root, value);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_BACKUP_ID");
  return target;
}
function createBackup({ root, backupRoot, id } = {}) {
  const sourceRoot = path.resolve(root || path.join(__dirname, ".."));
  const destinationRoot = path.resolve(backupRoot || path.join(sourceRoot, "backups"));
  const target = backupDirectory(destinationRoot, id);
  const files = inventory(sourceRoot);
  fs.mkdirSync(target, { recursive: true });
  for (const file of files) {
    const destination = path.join(target, file.relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, file.relativePath), destination);
  }
  const manifest = { version: VERSION, createdAt: new Date().toISOString(), appVersion: appVersion(sourceRoot), files };
  fs.writeFileSync(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return { id: path.basename(target), directory: target, manifest };
}
function readManifest(directory) {
  const file = path.join(directory, "manifest.json");
  if (!fs.existsSync(file)) throw new Error("MANIFEST_MISSING");
  let manifest;
  try { manifest = parseJSON(file); } catch (_) { throw new Error("MANIFEST_INVALID"); }
  if (manifest.version !== VERSION || !Array.isArray(manifest.files)) throw new Error("MANIFEST_INVALID");
  return manifest;
}
function verifyBackup(directory) {
  const target = path.resolve(directory);
  const manifest = readManifest(target);
  for (const file of manifest.files) {
    if (!safeRelative(file.relativePath)) throw new Error("INVALID_MANIFEST_PATH");
    const source = path.join(target, file.relativePath);
    if (!fs.existsSync(source)) throw new Error(`BACKUP_FILE_MISSING:${file.relativePath}`);
    if (fs.statSync(source).size !== file.sizeBytes || checksum(source) !== file.checksum) throw new Error(`CHECKSUM_MISMATCH:${file.relativePath}`);
    if (file.validJson) { try { parseJSON(source); } catch (_) { throw new Error(`INVALID_JSON:${file.relativePath}`); } }
  }
  return { ok: true, manifest, files: manifest.files.map(item => item.relativePath) };
}
function resolveBackup({ root, backupRoot, id }) {
  const sourceRoot = path.resolve(root || path.join(__dirname, ".."));
  const destinationRoot = path.resolve(backupRoot || path.join(sourceRoot, "backups"));
  return { root: sourceRoot, backupRoot: destinationRoot, directory: backupDirectory(destinationRoot, id) };
}
function restoreBackup({ root, backupRoot, id, dryRun = false } = {}) {
  const locations = resolveBackup({ root, backupRoot, id });
  const verification = verifyBackup(locations.directory);
  if (dryRun) return { ok: true, dryRun: true, files: verification.files, backupId: path.basename(locations.directory) };
  const safety = createBackup({ root: locations.root, backupRoot: locations.backupRoot, id: `safety-${Date.now()}` });
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "yasayan-restore-"));
  try {
    for (const file of verification.manifest.files) {
      const source = path.join(locations.directory, file.relativePath);
      const target = path.join(staging, file.relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      if (file.validJson) parseJSON(target);
    }
    for (const file of verification.manifest.files) {
      const target = path.join(locations.root, file.relativePath);
      const staged = path.join(staging, file.relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.${Date.now()}.restore.tmp`;
      fs.copyFileSync(staged, temporary);
      fs.renameSync(temporary, target);
    }
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  return { ok: true, dryRun: false, files: verification.files, safetyBackupId: safety.id, backupId: path.basename(locations.directory) };
}

module.exports = { INVENTORY, VERSION, checksum, createBackup, verifyBackup, restoreBackup, resolveBackup, safeRelative };
