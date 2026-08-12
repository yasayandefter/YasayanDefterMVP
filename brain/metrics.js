"use strict";

const startedAt = new Date().toISOString();
const state = {
  startedAt,
  requests: { total: 0, errors: 0 },
  routes: {},
  research: { standard: 0, current: 0, fallback: 0, providerFailures: 0, currentItems: 0, eventClusters: 0, independentDomains: 0, currentEmpty: 0, durationsMs: [], intents: {}, sourceCountBuckets: { zero: 0, one: 0, multi: 0 } },
  quiz: { starts: 0, answers: 0, completions: 0, duplicateAnswers: 0, duplicateCompletions: 0, storageFailures: 0, durationsMs: [] },
  storage: {},
  providers: {},
  cache: { hit: 0, miss: 0, expired: 0 },
  errors: {}
};

function safeName(value) { return String(value || "unknown").replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 80); }
function duration(bucket, value) { if (!Number.isFinite(value)) return; bucket.push(Math.max(0, Math.round(value))); if (bucket.length > 200) bucket.shift(); }
function incrementError(code) { const key = safeName(code || "INTERNAL_ERROR"); state.errors[key] = (state.errors[key] || 0) + 1; }
function requestStarted(route) { state.requests.total += 1; const key = safeName(route); state.routes[key] ||= { count: 0, errors: 0, durationsMs: [] }; state.routes[key].count += 1; }
function requestCompleted(route, status, durationMs) { const key = safeName(route); state.routes[key] ||= { count: 0, errors: 0, durationsMs: [] }; duration(state.routes[key].durationsMs, durationMs); if (Number(status) >= 400) { state.requests.errors += 1; state.routes[key].errors += 1; incrementError(status === 404 ? "NOT_FOUND" : status === 400 ? "BAD_REQUEST" : status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR"); } }
function recordStorage(store, operation, durationMs, success, recovered = false, fileSizeBytes = null) { const key = safeName(store); state.storage[key] ||= { reads: 0, writes: 0, recoveries: 0, failures: 0, durationsMs: [] }; const item = state.storage[key]; if (operation === "read") item.reads += 1; if (operation === "write") item.writes += 1; if (recovered) item.recoveries += 1; if (!success) item.failures += 1; duration(item.durationsMs, durationMs); }
function recordProvider(provider, durationMs, success, itemCount = 0, cacheHit = false) { const key = safeName(provider); state.providers[key] ||= { calls: 0, failures: 0, cacheHits: 0, itemCount: 0, durationsMs: [] }; const item = state.providers[key]; item.calls += 1; if (!success) item.failures += 1; if (cacheHit) item.cacheHits += 1; item.itemCount += Number(itemCount) || 0; duration(item.durationsMs, durationMs); }
function recordResearch(intent, sourceCount) { const key = safeName(intent); state.research.intents[key] = (state.research.intents[key] || 0) + 1; const bucket = sourceCount <= 0 ? "zero" : sourceCount === 1 ? "one" : "multi"; state.research.sourceCountBuckets[bucket] += 1; }
function recordCurrentCoverage(itemCount, eventCount, domainCount) { state.research.currentItems += Number(itemCount) || 0; state.research.eventClusters += Number(eventCount) || 0; state.research.independentDomains += Number(domainCount) || 0; if (!(Number(itemCount) > 0)) state.research.currentEmpty += 1; }
function summary() { return JSON.parse(JSON.stringify({ ...state, memory: { rss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed }, uptimeSec: Math.round(process.uptime()) })); }
function reset() { for (const key of Object.keys(state)) { if (key === "startedAt") continue; if (Array.isArray(state[key])) state[key].length = 0; else if (state[key] && typeof state[key] === "object") for (const child of Object.keys(state[key])) delete state[key][child]; } state.startedAt = new Date().toISOString(); state.requests = { total: 0, errors: 0 }; state.research = { standard: 0, current: 0, fallback: 0, providerFailures: 0, currentItems: 0, eventClusters: 0, independentDomains: 0, currentEmpty: 0, durationsMs: [], intents: {}, sourceCountBuckets: { zero: 0, one: 0, multi: 0 } }; state.quiz = { starts: 0, answers: 0, completions: 0, duplicateAnswers: 0, duplicateCompletions: 0, storageFailures: 0, durationsMs: [] }; state.storage = {}; state.cache = { hit: 0, miss: 0, expired: 0 }; state.errors = {}; }

module.exports = { state, requestStarted, requestCompleted, recordStorage, recordProvider, recordResearch, recordCurrentCoverage, incrementError, summary, reset, duration };
