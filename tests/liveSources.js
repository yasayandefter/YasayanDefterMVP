"use strict";
const { searchCurrent, clearCache } = require("../brain/currentProviders");
const freshness = require("../brain/freshness");
const currentClaims = require("../brain/currentClaims");
const currentQuality = require("../brain/currentContentQuality");
const providerHealth = require("../brain/providerHealth");
const metrics = require("../brain/metrics");

const queries = [
  ["technology", "Bugün teknoloji dünyasında neler oldu?"],
  ["ai", "Yapay zekâ alanındaki son gelişmeler"],
  ["science", "Bugünkü bilim haberleri"],
  ["space", "Bugünkü uzay gelişmeleri"],
  ["cybersecurity", "Bugünkü siber güvenlik gelişmeleri"],
  ["earthquake", "Son deprem nerede oldu?"]
];

(async () => {
  clearCache(); const report = []; let failures = 0;
  for (const [name, query] of queries) {
    const startedAt = Date.now(); const result = await searchCurrent(query, freshness.detectFreshness(query));
    const claimResult = currentClaims.buildClaims(result.events); const quiz = currentQuality.buildCurrentQuiz(result.events, claimResult.claims);
    const row = { category: name, state: result.items.length ? "CURRENT_VERIFIED" : "CURRENT_EMPTY", sourceCount: result.sources.length, independentDomains: result.independentDomains, itemCount: result.items.length, eventCount: result.events.length, claimCount: claimResult.claims.length, crossSourceClaims: claimResult.claims.filter(claim => claim.independentDomains >= 2).length, singleSourceOfficialClaims: claimResult.claims.filter(claim => claim.independentDomains === 1 && claim.authority >= 95).length, contradictionCount: claimResult.contradictions.length, verifiedQuiz: Boolean(quiz?.verified), providerFailures: result.providerErrors.map(error => `${error.source}:${error.code || "UNAVAILABLE"}`), durationMs: Date.now() - startedAt, newestSourceAt: result.newestSourceAt };
    const serialized = JSON.stringify({ items: result.items, events: result.events });
    row.htmlLeaks = (serialized.match(/<\/?[a-z][^>]*>|&nbsp;|\b(?:href|target|class)=/gi) || []).length;
    row.noiseLeaks = (serialized.match(/View CSAF|Expand All|Legal Notice|Privacy & Use Policy|Acknowledgments/gi) || []).length;
    report.push(row); if (!result.items.length || row.htmlLeaks || row.noiseLeaks) failures += 1;
  }
  const health = providerHealth.summary();
  const claimMetrics = metrics.summary().claims;
  console.log(JSON.stringify({ live: true, checkedAt: new Date().toISOString(), results: report, aliasObservation: { candidates: claimMetrics.aliasCandidates, highConfidence: claimMetrics.aliasHighConfidence, used: claimMetrics.aliasUsed, rejected: claimMetrics.aliasRejected, contradictions: claimMetrics.eventContradictions, claimSourceMappings: claimMetrics.claimSourceExpansions, crossSourceEvents: claimMetrics.eventCrossSource }, providerHealth: { healthy: health.healthy, degraded: health.degraded, cooldown: health.cooldown, providers: health.providers.map(item => ({ providerId: item.providerId, status: item.status, attempts: item.attempts, successes: item.successes, failures: item.failures, timeouts: item.timeouts, avgLatency: item.avgLatency, recentLatency: item.recentLatency })) } }, null, 2));
  if (failures) { console.error(`FAIL  ${failures} live current categories returned no verified item`); process.exitCode = 1; }
  else console.log("PASS  live keyless current sources returned clean verified items for technology, AI, science, space, cybersecurity, and earthquake");
})().catch(error => { console.error(`FAIL  live source test: ${error.message}`); process.exitCode = 1; });
