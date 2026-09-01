"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const profile = require("../brain/learningProfile");
const storagePolicy = require("../runtime/storagePolicy");
const authConfig = require("../auth/config");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const empty = profile.buildProfile([], new Date("2026-08-12T00:00:00.000Z"));
assert.equal(empty.brainScore, 0);
const active = profile.buildProfile([{ topic: "Mars", timesSearched: 2, quizScore: { total: 4, score: 3, xpAwarded: 24 }, updatedAt: "2026-08-12T00:00:00.000Z" }], new Date("2026-08-12T00:00:00.000Z"));
assert.equal(active.brainScore, profile.calculateBrainScore(active));
assert.ok(active.brainScore > 0 && active.brainScore <= 100);

assert.equal(storagePolicy.accessMode({ ACCESS_MODE: "public-demo" }), "public-demo");
assert.equal(storagePolicy.effectiveStorageMode({ ACCESS_MODE: "public-demo", STORAGE_MODE: "postgres" }), "ephemeral");
assert.equal(storagePolicy.filesystemPersistenceEnabled({ ACCESS_MODE: "public-demo" }), false);
assert.equal(storagePolicy.filesystemPersistenceEnabled({ ACCESS_MODE: "local-pilot", STORAGE_MODE: "json" }), true);
assert.equal(authConfig.getConfig({ ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: "postgres://fixture", APP_ORIGIN: "https://example.test" }).accessMode, "authenticated");

const app = read("assets/js/app.js");
const auth = read("assets/js/auth.js");
const profileUi = read("assets/js/professional15.js");
const brainScoreUi = read("assets/js/professional14.js");
const index = read("index.html");
const server = read("server.js");

assert.match(app, /window\.YasayanDefterAuth\?\.authenticated === true[\s\S]*\/api\/memory\/save/);
assert.match(app, /\/api\/memory\/list/);
assert.match(app, /keyFacts:/);
assert.match(app, /Kaydetmek için giriş yap/);
assert.match(app, /if\(isDemoMode\(\)\) return \[\];/);
assert.doesNotMatch(profileUi, /Yaşayan Öğrenci|streak\s*:\s*1|weeklyGoal\s*:\s*5/);
assert.doesNotMatch(brainScoreUi, /Math\.max\(8/);
assert.match(brainScoreUi, /öğrenme göstergesi/i);
assert.match(brainScoreUi, /bilimsel bir zekâ ölçümü değildir/i);
assert.match(auth, /role:\s*"dialog"/);
assert.match(auth, /aria-modal/);
assert.match(auth, /event\.key === "Escape"/);
assert.match(auth, /focusTarget\.focus/);

for (const value of [index, app, server]) {
  assert.doesNotMatch(value, /Brain Engine (?:10|11)\.0|Yaşayan Defter 13 Professional|Version 11\.0/i);
}
assert.match(index, /Yaşayan Defter 15\.0 Pilot/);
assert.equal(require("../package.json").version, "15.7.0");

console.log("PASS  Yaşayan Defter 15.0 pilot product modes, honest profile, Brain Score, Defterim, auth accessibility, and branding");
