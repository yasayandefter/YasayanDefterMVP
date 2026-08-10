"use strict";
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { INVENTORY } = require("./pilotStorage");
const root = path.join(__dirname, "..");
const port = Number(process.env.PORT || 3000);
const checks = { node: process.versions.node, packageVersion: "unknown", directories: true, json: true, backupWritable: false, portAvailable: false };
try { checks.packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version || "unknown"; } catch (_) { checks.json = false; }
for (const item of INVENTORY) {
  const file = path.join(root, item.relativePath);
  if (!fs.existsSync(file)) { if (item.required) checks.json = false; continue; }
  try { JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { checks.json = false; }
}
const backupRoot = path.join(root, "backups");
try { fs.mkdirSync(backupRoot, { recursive: true }); const probe = path.join(backupRoot, `.pilot-check-${process.pid}`); fs.writeFileSync(probe, "ok"); fs.unlinkSync(probe); checks.backupWritable = true; } catch (_) {}
const probeServer = net.createServer();
probeServer.once("error", () => { console.log(JSON.stringify({ ok: false, ...checks })); process.exitCode = 1; });
probeServer.listen(port, "127.0.0.1", () => { checks.portAvailable = true; probeServer.close(() => { checks.ok = checks.json && checks.backupWritable; console.log(JSON.stringify(checks)); if (!checks.ok) process.exitCode = 1; }); });
