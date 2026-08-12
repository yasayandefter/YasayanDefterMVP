"use strict";

const { SOURCES, sourcesFor, isAllowedProviderUrl } = require("./currentSources");
const { parseFeed, parseGeoJson } = require("./feedParser");
const { fetchProvider } = require("./feedProviders");
const { WINDOWS, normalize } = require("./freshness");
const metrics = require("./metrics");
const currentQuality = require("./currentContentQuality");
const currentClaims = require("./currentClaims");
const providerHealth = require("./providerHealth");
const claimSignatures = require("./claimSignatures");
const adaptiveAliases = require("./adaptiveAliases");

const queryCache = new Map(); const feedCache = new Map();
const MAX_QUERY_CACHE = 200; const MAX_FEED_CACHE = 100;
function setBounded(cache, key, value, limit) { cache.delete(key); cache.set(key, value); while (cache.size > limit) cache.delete(cache.keys().next().value); }
const CURRENT_STOP = new Set("bugun bugunku guncel haber haberleri son gelismeler gelismeleri alanindaki dunyasinda neler oldu su an simdi bu hafta bu ay nerede what latest today news current recent developments the in of".split(" "));
const TOPIC_TERMS = {
  ai: /\b(ai|artificial intelligence|machine learning|deep learning|neural|llm|model|agent|yapay zeka|makine ogren)\b/,
  technology: /\b(technology|tech|software|hardware|computer|digital|cyber|robot|mobile|chip|semiconductor|quantum|innovation|teknoloji|yazilim|donanim|bilgisayar|robot|mobil)\b/,
  science: /\b(science|scientific|research|physics|chemistry|biology|genome|climate|quantum|bilim|arastirma|fizik|kimya|biyoloji)\b/,
  space: /\b(space|nasa|esa|planet|moon|mars|orbit|satellite|telescope|rocket|astronaut|lunar|solar|uzay|gezegen|ay|yörünge|uydu|roket)\b/,
  cybersecurity: /\b(cyber|security|vulnerability|malware|ransomware|exploit|siber|guvenlik)\b/
};

function routeCategories(query, detection = {}) {
  const text = normalize(query); if (detection.category === "earthquake") return ["earthquake"];
  if (TOPIC_TERMS.ai.test(text)) return ["ai", "technology"];
  if (TOPIC_TERMS.cybersecurity.test(text)) return ["cybersecurity", "technology"];
  if (detection.category === "space") return ["space", "science"];
  if (detection.category === "science") return ["science", "space"];
  if (detection.category === "technology") return ["technology"];
  return [detection.category || "general"];
}
function meaningfulTokens(query) { return normalize(query).split(/\s+/).filter(token => token.length > 2 && !CURRENT_STOP.has(token)); }
function relevant(item, query, categories) {
  if (categories.includes("earthquake")) return item.category === "earthquake";
  const text = normalize(`${item.title} ${item.summary || item.text}`); const specific = categories.find(category => ["ai", "cybersecurity"].includes(category));
  if (specific) return TOPIC_TERMS[specific].test(text);
  const primary = categories[0]; if (TOPIC_TERMS[primary]?.test(text)) return true;
  const tokens = meaningfulTokens(query); return tokens.length > 0 && tokens.some(token => text.includes(token));
}
function titleTokens(value) { return new Set(normalize(value).split(" ").filter(token => token.length > 3 && !CURRENT_STOP.has(token))); }
function similarity(a, b) { const left = titleTokens(a); const right = titleTokens(b); if (!left.size || !right.size) return 0; const shared = [...left].filter(token => right.has(token)).length; return shared / Math.min(left.size, right.size); }
function dedupe(items) {
  const output = [];
  for (const item of items) {
    if (output.some(existing => existing.url === item.url || (Math.abs(Date.parse(existing.publishedAt) - Date.parse(item.publishedAt)) < 3 * 86400000 && similarity(existing.title, item.title) >= 0.82))) continue;
    output.push(item);
  }
  return output;
}
function diversify(items, limit = 20) {
  const queues = new Map(); items.forEach(item => { if (!queues.has(item.domain)) queues.set(item.domain, []); queues.get(item.domain).push(item); });
  const output = []; let round = 0; const rounds = Math.max(0, ...[...queues.values()].map(queue => queue.length));
  while (output.length < limit && round < rounds) {
    for (const queue of queues.values()) { if (queue[round]) output.push(queue[round]); if (output.length >= limit) break; }
    round += 1;
  }
  return output;
}
function clusterEvents(items, limit = 10) {
  const clusters = []; const aliasRegistry = adaptiveAliases.buildRegistry(items); const matchStats = { signatureMatches: 0, bilingualMatches: 0, rejected: 0, sameOrgMultiSource: 0, aliasCandidates: aliasRegistry.candidates.length, aliasHighConfidence: aliasRegistry.highConfidence.length, aliasUsed: 0, aliasRejected: aliasRegistry.rejected };
  for (const item of items) {
    const itemSignature = claimSignatures.signature(`${item.title} ${item.summary || ""}`, { category: item.subcategory || item.category, publishedAt: item.publishedAt, language: item.language, aliasRegistry }); matchStats.aliasUsed += itemSignature.entityAliasesUsed.length; let decision = null;
    const cluster = clusters.find(value => { const result = claimSignatures.match(value.signature, itemSignature); if (result.matched) { decision = result; return true; } if (result.rejectedReason) matchStats.rejected += 1; return false; });
    const sourceRef = { providerId: item.providerId, sourceName: item.sourceName, domain: item.domain, url: item.url, publishedAt: item.publishedAt, title: item.title, summary: item.summary, authority: item.authority };
    if (cluster) { if (!cluster.sources.some(source => source.url === item.url)) cluster.sources.push(sourceRef); const domains = new Set(cluster.sources.map(source => claimSignatures.normalizeDomain(source.domain)).filter(Boolean)); cluster.independentDomains = domains.size; cluster.crossSourceSupport = domains.size >= 2; cluster.sourceCount = cluster.sources.length; cluster.matchReasons = [...new Set([...(cluster.matchReasons || []), ...(decision?.matchReasons || [])])]; matchStats.signatureMatches += 1; if (cluster.signature.language && itemSignature.language && cluster.signature.language !== itemSignature.language) matchStats.bilingualMatches += 1; if (cluster.sources.length > domains.size) matchStats.sameOrgMultiSource += 1; }
    else clusters.push({ headline: item.title, summary: item.summary, whyItMatters: item.whyItMatters || "", subcategory: item.subcategory, publishedAt: item.publishedAt, facts: [item.summary || item.title].filter(Boolean), sources: [sourceRef], sourceName: item.sourceName, sourceRefs: [item.url], sourceCount: 1, independentDomains: 1, crossSourceSupport: false, signature: itemSignature, matchReasons: [] });
  }
  const output = clusters.slice(0, limit).map((cluster, index) => { const domains = new Set(cluster.sources.map(source => claimSignatures.normalizeDomain(source.domain)).filter(Boolean)); return { ...cluster, id: cluster.id || `event-${index + 1}`, sourceRefs: cluster.sources.map(source => source.url), sourceCount: cluster.sources.length, independentDomains: domains.size, crossSourceSupport: domains.size >= 2 }; });
  metrics.recordClaimMatching({ ...matchStats, eventCrossSource: output.filter(event => event.crossSourceSupport).length }); return output;
}
async function mapLimit(values, limit, task) {
  const results = new Array(values.length); let cursor = 0;
  async function worker() { while (cursor < values.length) { const index = cursor; cursor += 1; try { results[index] = { status: "fulfilled", value: await task(values[index]) }; } catch (reason) { results[index] = { status: "rejected", reason }; } } }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker)); return results;
}
async function providerItems(source, fetcher, options, categoryKey, windowName) {
  const key = `${source.id}|${categoryKey}|${windowName}`; const cached = feedCache.get(key); const now = Date.now();
  if (cached && now - cached.createdAt < source.ttlMs) return { ...cached.value, cacheHit: true };
  const value = await fetchProvider(source, fetcher, options); setBounded(feedCache, key, { createdAt: now, value }, MAX_FEED_CACHE); return { ...value, cacheHit: false };
}
async function searchCurrent(query, detection, options = {}) {
  const categories = routeCategories(query, detection); const windowName = detection?.requestedWindow || "latest"; const available = providerHealth.ordered(sourcesFor(categories), options); const selected = available.filter(source => providerHealth.shouldAttempt(source.id, options)); const skipped = available.filter(source => !providerHealth.shouldAttempt(source.id, options)); const providerIds = available.map(source => source.id).sort().join(","); const key = `current|${normalize(query)}|${categories.join("+")}|${windowName}|${providerIds}`; const now = Number(options.now) || Date.now(); const cached = queryCache.get(key); const ttl = selected.length ? Math.min(...selected.map(source => source.ttlMs), 180_000) : 30_000;
  if (cached && now - cached.createdAt < ttl) { metrics.state.cache.hit += 1; return { ...cached.value, cacheHit: true }; }
  metrics.state.cache.miss += 1; const fetcher = options.fetcher || global.fetch;
  const concurrency = Math.min(Number(options.concurrency) || 4, 5); const overallDeadlineMs = Math.max(1000, Math.min(Number(options.overallDeadlineMs) || 8000, 12_000)); const batches = Math.max(1, Math.ceil(selected.length / concurrency)); const perProviderBudget = Math.max(500, Math.floor(overallDeadlineMs / batches)); const requestOptions = { ...options, timeoutMs: Math.min(Number(options.timeoutMs) || perProviderBudget, perProviderBudget) };
  const results = await mapLimit(selected, concurrency, async source => { const feedKey = `${source.id}|${categories.join("+")}|${windowName}`; const cachedFeed = feedCache.get(feedKey); if (cachedFeed && Date.now() - cachedFeed.createdAt < source.ttlMs) return providerItems(source, fetcher, requestOptions, categories.join("+"), windowName); const started = Date.now(); providerHealth.begin(source.id); try { const result = await providerItems(source, fetcher, requestOptions, categories.join("+"), windowName); providerHealth.success(source.id, result.durationMs, options); return result; } catch (error) { providerHealth.failure(source.id, error, Date.now() - started, options); throw error; } });
  const errors = skipped.map(source => ({ source: source.id, code: "PROVIDER_COOLDOWN", message: "Provider temporarily unavailable" })); let items = [];
  results.forEach((result, index) => { const source = selected[index]; if (result.status === "fulfilled") { items.push(...result.value.items); metrics.recordProvider(source.id, result.value.durationMs, true, result.value.items.length, result.value.cacheHit, providerHealth.snapshot(source.id, options)); } else { errors.push({ source: source.id, code: String(result.reason?.message || "PROVIDER_UNAVAILABLE").replace(/[^A-Z0-9_\-]/gi, "_").slice(0, 80), message: "Provider unavailable" }); metrics.recordProvider(source.id, providerHealth.snapshot(source.id, options).recentLatency, false, 0, false, providerHealth.snapshot(source.id, options)); } });
  const cutoff = now - (WINDOWS[windowName] || 7) * 86400000;
  items = dedupe(items.filter(item => item.publishedAt && Date.parse(item.publishedAt) >= cutoff).filter(item => relevant(item, query, categories)).map(item => ({ ...currentQuality.qualityItem(item), currentRelevanceVerified: true })).sort((a, b) => b.authority - a.authority || Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
  items = currentQuality.rankDiverse(items, { limit: 20, genericTechnology: categories.length === 1 && categories[0] === "technology", specificCategory: ["cybersecurity", "ai"].includes(categories[0]) }); const events = clusterEvents(items, 10); const sources = [...new Set(items.map(item => item.sourceName))]; const independentDomains = new Set(items.map(item => claimSignatures.normalizeDomain(item.domain)).filter(Boolean)).size;
  const value = { items, events, sources, providerErrors: errors, cacheHit: false, checkedAt: new Date(now).toISOString(), category: detection?.category || "general", categories, window: windowName, newestSourceAt: items[0]?.publishedAt || null, independentDomains, providerHealthSummary: providerHealth.summary(options) };
  metrics.recordCurrentCoverage(items.length, events.length, independentDomains);
  setBounded(queryCache, key, { createdAt: now, value }, MAX_QUERY_CACHE); return value;
}
function clearCache() { queryCache.clear(); feedCache.clear(); }
function cacheStats() { return { queryEntries: queryCache.size, feedEntries: feedCache.size, maxQueryEntries: MAX_QUERY_CACHE, maxFeedEntries: MAX_FEED_CACHE }; }

module.exports = { SOURCES, parseFeed, normalizeGeoJson: parseGeoJson, isAllowedProviderUrl, routeCategories, relevant, dedupe, diversify, clusterEvents, mapLimit, searchCurrent, clearCache, cacheStats };
