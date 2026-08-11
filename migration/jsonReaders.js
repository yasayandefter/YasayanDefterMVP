"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const FILES = Object.freeze({
  main: "memory.json",
  learning: "yasayan_deefter_memory.json",
  classrooms: path.join("data", "classrooms.json"),
  students: path.join("data", "students.json"),
  quizAttempts: path.join("data", "quiz-attempts.json")
});

function readJson(root, logicalName, relativePath) {
  const absolute = path.resolve(root, relativePath);
  let raw = ""; let parsed = null; let valid = true; let errorCode = null;
  try { raw = fs.readFileSync(absolute, "utf8"); parsed = JSON.parse(raw); } catch (error) { valid = false; errorCode = error.code === "ENOENT" ? "FILE_MISSING" : "INVALID_JSON"; }
  const stat = fs.existsSync(absolute) ? fs.statSync(absolute) : null;
  const data = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed?.memories) ? parsed.memories : [];
  return { logicalName, relativePath: relativePath.replace(/\\/g, "/"), size: stat?.size || 0, sha256: crypto.createHash("sha256").update(raw).digest("hex"), recordCount: data.length, validJson: valid, errorCode, data };
}

function readSources(root) { return Object.entries(FILES).map(([logicalName, relativePath]) => readJson(root, logicalName, relativePath)); }
function snapshotManifest(sources, capturedAt = new Date().toISOString()) { return sources.map(source => ({ logicalName: source.logicalName, relativePath: source.relativePath, size: source.size, sha256: source.sha256, recordCount: source.recordCount, validJson: source.validJson, capturedAt })); }

module.exports = { FILES, readJson, readSources, snapshotManifest };
