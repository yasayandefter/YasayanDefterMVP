"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(process.env.VERCEL_READONLY_ROOT || "/var/task");
const trapped = [
  "mkdirSync", "writeFileSync", "openSync", "copyFileSync", "renameSync", "unlinkSync",
  "readFileSync", "existsSync"
];
let trappedCalls = 0;

function targetsReadOnlyRoot(value) {
  if (typeof value === "number" || value == null) return false;
  const resolved = path.resolve(String(value));
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

for (const method of trapped) {
  const original = fs[method];
  fs[method] = function trappedFilesystemCall(...args) {
    if (targetsReadOnlyRoot(args[0])) {
      trappedCalls += 1;
      const error = new Error(`VERCEL_READONLY_FILESYSTEM_CALL:${method}:${args[0]}`);
      error.code = "EROFS";
      throw error;
    }
    return original.apply(this, args);
  };
}

process.on("beforeExit", () => {
  if (trappedCalls > 0) process.exitCode = 91;
});
