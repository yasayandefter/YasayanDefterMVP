"use strict";
const path = require("node:path");
const { verifyBackup, resolveBackup } = require("./pilotStorage");
try {
  const id = process.argv[2];
  const root = path.join(__dirname, "..");
  const backupRoot = path.join(root, "backups");
  const target = id ? resolveBackup({ root, backupRoot, id }).directory : (() => {
    const entries = require("node:fs").readdirSync(backupRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
    if (!entries.length) throw new Error("BACKUP_NOT_FOUND");
    return path.join(backupRoot, entries[0]);
  })();
  const result = verifyBackup(target);
  console.log(JSON.stringify({ ok: true, backupId: path.basename(target), files: result.files }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.message || "VERIFY_FAILED", message: "Backup doğrulanamadı." }));
  process.exitCode = 1;
}
