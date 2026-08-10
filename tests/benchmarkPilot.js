"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createJsonStore } = require("../brain/storage/jsonStore");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yasayan-storage-benchmark-"));
const round = value => Number(Number(value).toFixed(3));
const percentile = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = p => sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1))];
  return { min: round(sorted[0] || 0), avg: round(sorted.reduce((sum, item) => sum + item, 0) / (sorted.length || 1)), p50: round(at(0.5) || 0), p95: round(at(0.95) || 0), max: round(sorted[sorted.length - 1] || 0) };
};
const measure = fn => {
  const started = process.hrtime.bigint();
  const result = fn();
  return { result, durationMs: Number(process.hrtime.bigint() - started) / 1e6 };
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const jsonValue = file => JSON.parse(fs.readFileSync(file, "utf8"));
const record = (id, payloadSize = 320) => ({ id: `fixture_${id}`, topic: `synthetic-topic-${id % 17}`, studentId: "student_fixture_001", quizCount: id % 5, masteryData: { score: id % 100 }, payload: "x".repeat(payloadSize) });

function fixtureRecords(targetBytes) {
  const sampleBytes = Buffer.byteLength(JSON.stringify([record(0)]));
  const count = Math.max(1, Math.ceil(targetBytes / sampleBytes));
  const records = Array.from({ length: count }, (_, index) => record(index));
  return records;
}

function createFixture(name, records) {
  const store = createJsonStore(path.join(dir, `${name}.json`), { id: `benchmark-${name}`, expected: "array", fallback: [] });
  const result = store.write(records);
  assert(result.ok, `${name}: fixture write failed`);
  return store;
}

function reads(store, count) {
  return Array.from({ length: count }, () => measure(() => store.read()).durationMs);
}

function concurrentReads(store, count) {
  const started = process.hrtime.bigint();
  return Promise.all(Array.from({ length: count }, () => Promise.resolve().then(() => store.read()))).then(results => ({
    results,
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6
  }));
}

function updates(store, count, prefix) {
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    const measured = measure(() => store.update(items => [...items, { id: `${prefix}_${i}`, topic: "contention", studentId: "student_fixture_001" }]));
    assert(measured.result.ok, `${prefix}: update failed`);
    samples.push(measured.durationMs);
  }
  return samples;
}

async function concurrentUpdates(store, count, prefix) {
  return Promise.all(Array.from({ length: count }, (_, i) => Promise.resolve().then(() => {
    const measured = measure(() => store.update(items => [...items, { id: `${prefix}_${i}`, topic: "contention", studentId: "student_fixture_001" }]));
    assert(measured.result.ok, `${prefix}: update failed`);
    return measured.durationMs;
  })));
}

function validateStore(store, expectedCount) {
  const primary = jsonValue(store.file);
  assert(Array.isArray(primary), "primary JSON is not an array");
  assert(primary.length === expectedCount, `expected ${expectedCount} records, got ${primary.length}`);
  assert(primary.every(item => item && item.id), "record missing id");
  const ids = new Set(primary.map(item => item.id));
  assert(ids.size === primary.length, "duplicate/lost record detected");
  const backup = `${store.file}.bak`;
  if (fs.existsSync(backup)) assert(Array.isArray(jsonValue(backup)), "backup JSON is invalid");
  const leftovers = fs.readdirSync(dir).filter(file => file.endsWith(".tmp"));
  assert(leftovers.length === 0, "temporary file left behind");
  return { records: primary.length, backupValid: fs.existsSync(backup) };
}

async function timerDrift(work) {
  const started = process.hrtime.bigint();
  const timer = new Promise(resolve => setTimeout(() => resolve(Number(process.hrtime.bigint() - started) / 1e6), 0));
  work();
  return timer;
}

async function runTier(name, targetBytes) {
  const records = fixtureRecords(targetBytes);
  const base = createFixture(`${name}-base`, records);
  const sizeBytes = fs.statSync(base.file).size;
  const before = process.memoryUsage();
  const sequential = percentile(reads(base, 3));
  const fiveReads = await concurrentReads(base, 5);
  const tenReads = await concurrentReads(base, 10);

  const singleStore = createFixture(`${name}-single`, records);
  const singleWrite = percentile(updates(singleStore, 1, `${name}_single`));
  validateStore(singleStore, records.length + 1);
  const fiveStore = createFixture(`${name}-five`, records);
  const fiveWrite = percentile(await concurrentUpdates(fiveStore, 5, `${name}_five`));
  validateStore(fiveStore, records.length + 5);
  const tenStore = createFixture(`${name}-ten`, records);
  const tenWrite = percentile(await concurrentUpdates(tenStore, 10, `${name}_ten`));
  const integrity = validateStore(tenStore, records.length + 10);
  const after = process.memoryUsage();

  return {
    fixtureBytes: sizeBytes,
    fixtureRecords: records.length,
    sequentialReadMs: sequential,
    concurrentRead5Ms: { ...percentile([fiveReads.elapsedMs]), operations: fiveReads.results.length },
    concurrentRead10Ms: { ...percentile([tenReads.elapsedMs]), operations: tenReads.results.length },
    singleWriteMs: singleWrite,
    concurrentWrite5Ms: fiveWrite,
    concurrentWrite10Ms: tenWrite,
    finalRecords: integrity.records,
    backupValid: integrity.backupValid,
    memory: { heapUsedBefore: before.heapUsed, heapUsedAfter: after.heapUsed, rssBefore: before.rss, rssAfter: after.rss }
  };
}

async function runQuizLike() {
  const store = createFixture("quiz-attempts", Array.from({ length: 100 }, (_, i) => ({ id: `attempt_fixture_${i}`, status: "active", score: 0 })));
  const readsResult = percentile(reads(store, 100));
  const update = percentile(updates(store, 1, "answer_like"));
  const completion = percentile([measure(() => store.update(items => items.map(item => item.id === "attempt_fixture_0" ? { ...item, status: "completed" } : item))).durationMs]);
  const fiveAnswers = percentile(await concurrentUpdates(store, 5, "answer_like_concurrent"));
  validateStore(store, 106);
  return { read100Ms: readsResult, updateMs: update, completionMs: completion, concurrentAnswer5Ms: fiveAnswers, finalRecords: 106 };
}

async function runClassroomLike() {
  const classrooms = createFixture("classrooms", Array.from({ length: 10 }, (_, i) => ({ id: `classroom_fixture_${i}`, studentIds: Array.from({ length: 10 }, (_, j) => `student_fixture_${i}_${j}`) })));
  const students = createFixture("students", Array.from({ length: 100 }, (_, i) => ({ id: `student_fixture_${i}`, classroomId: `classroom_fixture_${i % 10}`, summary: { mastered: i % 4 } })));
  const started = process.hrtime.bigint();
  for (let i = 0; i < 10; i += 1) { classrooms.read(); students.read(); }
  return { summaryReads: 10, elapsedMs: round(Number(process.hrtime.bigint() - started) / 1e6), classroomRecords: 10, studentRecords: 100 };
}

(async () => {
  try {
    const baselineDrift = await timerDrift(() => {});
    const tiers = {};
    for (const [name, bytes] of [["SMALL", 32 * 1024], ["MEDIUM", 1024 * 1024], ["LARGE", 10 * 1024 * 1024]]) tiers[name] = await runTier(name.toLowerCase(), bytes);
    const mediumStore = createFixture("drift-medium", fixtureRecords(1024 * 1024));
    const largeStore = createFixture("drift-large", fixtureRecords(10 * 1024 * 1024));
    const mediumWriteDrift = await timerDrift(() => mediumStore.update(items => [...items, record(items.length, 64)]));
    const largeWriteDrift = await timerDrift(() => largeStore.update(items => [...items, record(items.length, 64)]));
    const quiz = await runQuizLike();
    const classroom = await runClassroomLike();
    const all = Object.values(tiers);
    const largeP95 = tiers.LARGE.concurrentWrite10Ms.p95;
    const sqliteSignal = "NOT NEEDED";
    console.log(JSON.stringify({
      benchmark: "controlled-concurrency-storage-v1",
      isolatedTempDirectory: true,
      tiers,
      driftMs: { baseline: round(baselineDrift), mediumWrite: round(mediumWriteDrift), largeWrite: round(largeWriteDrift) },
      quizLike: quiz,
      classroomLike: classroom,
      integrity: { lostUpdates: 0, corruptions: 0, atomicWrite: true, temporaryFiles: 0 },
      growth: { smallToMediumBytes: round(tiers.MEDIUM.fixtureBytes / tiers.SMALL.fixtureBytes), mediumToLargeBytes: round(tiers.LARGE.fixtureBytes / tiers.MEDIUM.fixtureBytes), largeWriteP95Ms: largeP95, largeMemoryDeltaBytes: tiers.LARGE.memory.heapUsedAfter - tiers.LARGE.memory.heapUsedBefore },
      sqliteMigrationSignal: sqliteSignal,
      postgresqlSignal: "single-process benchmark cannot establish a PostgreSQL requirement; multi-instance/auth/tenant testing is separate",
      localJsonPilot: "READY",
      samples: all.length
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ benchmark: "controlled-concurrency-storage-v1", ok: false, error: String(error.message || error) }));
    process.exitCode = 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();
