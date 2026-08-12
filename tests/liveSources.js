"use strict";
const { searchCurrent, clearCache } = require("../brain/currentProviders");
const freshness = require("../brain/freshness");

const queries = [
  ["technology", "Bugün teknoloji dünyasında neler oldu?"],
  ["ai", "Yapay zekâ alanındaki son gelişmeler"],
  ["science", "Bugünkü bilim haberleri"],
  ["space", "Bugünkü uzay gelişmeleri"],
  ["earthquake", "Son deprem nerede oldu?"]
];

(async () => {
  clearCache(); const report = []; let failures = 0;
  for (const [name, query] of queries) {
    const startedAt = Date.now(); const result = await searchCurrent(query, freshness.detectFreshness(query));
    const row = { category: name, state: result.items.length ? "CURRENT_VERIFIED" : "CURRENT_EMPTY", sourceCount: result.sources.length, independentDomains: result.independentDomains, itemCount: result.items.length, eventCount: result.events.length, providerFailures: result.providerErrors.map(error => `${error.source}:${error.code || "UNAVAILABLE"}`), durationMs: Date.now() - startedAt, newestSourceAt: result.newestSourceAt };
    report.push(row); if (!result.items.length) failures += 1;
  }
  console.log(JSON.stringify({ live: true, checkedAt: new Date().toISOString(), results: report }, null, 2));
  if (failures) { console.error(`FAIL  ${failures} live current categories returned no verified item`); process.exitCode = 1; }
  else console.log("PASS  live keyless current sources returned verified items for technology, AI, science, space, and earthquake");
})().catch(error => { console.error(`FAIL  live source test: ${error.message}`); process.exitCode = 1; });
