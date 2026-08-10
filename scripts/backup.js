"use strict";
const { createBackup } = require("./pilotStorage");
try {
  const result = createBackup({ id: process.argv[2] });
  console.log(JSON.stringify({ ok: true, backupId: result.id, files: result.manifest.files.map(file => file.logicalName) }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.message || "BACKUP_FAILED", message: "Backup oluşturulamadı." }));
  process.exitCode = 1;
}
