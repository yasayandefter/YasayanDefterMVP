"use strict";
const path = require("node:path");
const { restoreBackup } = require("./pilotStorage");
const id = process.argv[2];
if (!id) { console.error(JSON.stringify({ ok: false, code: "BACKUP_ID_REQUIRED", message: "Backup kimliği gerekli." })); process.exitCode = 1; }
else try { console.log(JSON.stringify(restoreBackup({ root: path.join(__dirname, ".."), backupRoot: path.join(__dirname, "..", "backups"), id, dryRun: true }))); }
catch (error) { console.error(JSON.stringify({ ok: false, code: error.message || "DRY_RUN_FAILED", message: "Restore dry-run başarısız oldu." })); process.exitCode = 1; }
