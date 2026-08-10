"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createJsonStore } = require("../brain/storage/jsonStore");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yasayan-benchmark-"));
const store = createJsonStore(path.join(dir, "fixture.json"), { id: "benchmark-fixture", expected: "array", fallback: [] });
const samples = [];
const measure = fn => { const start = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - start) / 1e6; };
for (let i = 0; i < 50; i += 1) { samples.push(measure(() => store.update(items => [...items, { id: i, topic: `fixture-${i}` }]))); }
for (let i = 0; i < 50; i += 1) samples.push(measure(() => store.read()));
const sorted = samples.slice().sort((a, b) => a - b);
const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
console.log(JSON.stringify({ benchmark: "pilot-json-store", operations: samples.length, minMs: Number(sorted[0].toFixed(3)), averageMs: Number(average.toFixed(3)), p50Ms: Number(percentile(0.5).toFixed(3)), p95Ms: Number(percentile(0.95).toFixed(3)), maxMs: Number(sorted[sorted.length - 1].toFixed(3)), finalSizeBytes: fs.statSync(store.file).size, isolatedTempDirectory: true }));
fs.rmSync(dir, { recursive: true, force: true });
