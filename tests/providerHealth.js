"use strict";
const assert = require("node:assert/strict");
const health = require("../brain/providerHealth");

health.reset(); const id = "slow-official"; let now = 1_000;
for (let index = 0; index < 3; index += 1) { health.begin(id); health.failure(id, new Error("PROVIDER_TIMEOUT"), 6500, { now, cooldownMs: 1000 }); now += 10; }
let snapshot = health.snapshot(id, { now }); assert.equal(snapshot.status, "cooldown"); assert.equal(snapshot.timeouts, 3); assert.equal(health.shouldAttempt(id, { now }), false);
now += 1100; assert.equal(health.shouldAttempt(id, { now }), true); health.begin(id); health.success(id, 40, { now }); snapshot = health.snapshot(id, { now }); assert.notEqual(snapshot.status, "cooldown"); assert.equal(health.shouldAttempt(id, { now }), true); assert.equal(snapshot.recoveries, 1); assert.equal(snapshot.consecutiveFailures, 0);

health.reset(); health.begin("fast"); health.success("fast", 25, { now: 100 }); health.begin("slow"); health.success("slow", 5800, { now: 100 });
const ordered = health.ordered([{ id: "slow", authority: 100 }, { id: "fast", authority: 80 }]); assert.equal(ordered[0].id, "fast"); assert.equal(ordered[1].authority, 100);
assert.equal(health.summary().providers.length, 2); health.reset(); assert.equal(health.summary().providers.length, 0);
console.log("PASS  process-memory provider health, timeout classification, bounded cooldown, recovery probe, latency-aware ordering, and restart reset");
