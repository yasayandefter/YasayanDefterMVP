"use strict";

const { SOURCES, sourcesFor, isAllowedProviderUrl } = require("./currentSources");
const { WINDOWS, normalize } = require("./freshness");
const metrics = require("./metrics");

const cache = new Map();
const TRUST = { official: 3, institutional: 2, trusted_feed: 1, fallback: 0 };

function decodeEntities(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}
function sanitizeText(value) {
  return decodeEntities(String(value || "").replace(/<!\[CDATA\[/gi, "").replace(/\]\]>/g, "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}
function field(block, names) {
  for (const name of names) { const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i")); if (match) return match[1]; }
  return "";
}
function parseFeed(xml, source) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
  return blocks.map(block => {
    const linkTag = block.match(/<link[^>]*(?:href=["']([^"']+)["'])?[^>]*>/i);
    const link = linkTag?.[1] || field(block, ["link"]).trim();
    const rawDate = field(block, ["pubDate", "published", "updated", "date"]);
    const parsedDate = Date.parse(sanitizeText(rawDate));
    return { title: sanitizeText(field(block, ["title"])) || "Güncel gelişme", url: link, publishedAt: Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null, text: sanitizeText(field(block, ["description", "summary", "content"])), source: source.name, sourceId: source.id, trust: source.trust };
  }).filter(item => item.url && isHttpUrl(item.url));
}
function isHttpUrl(value) { try { const u = new URL(value); return u.protocol === "https:"; } catch (_) { return false; } }
function normalizeGeoJson(payload, source) {
  return (Array.isArray(payload?.features) ? payload.features : []).map(feature => {
    const p = feature.properties || {};
    const timestamp = Number(p.time);
    return { title: sanitizeText(p.title || p.place || "Deprem"), url: isHttpUrl(p.url) ? p.url : null, publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null, text: sanitizeText(p.place || ""), source: source.name, sourceId: source.id, trust: source.trust, magnitude: Number.isFinite(Number(p.mag)) ? Number(p.mag) : null, coordinates: feature.geometry?.coordinates || null };
  });
}
function relevant(item, query, category) {
  if (category === "earthquake") return true;
  const tokens = normalize(query).split(/\s+/).filter(token => token.length > 2);
  const haystack = normalize(`${item.title} ${item.text}`);
  return !tokens.length || tokens.some(token => haystack.includes(token)) || category === "general";
}
function dedupe(items) {
  const seen = new Set(); const out = [];
  for (const item of items) { const key = normalize(item.url || item.title); if (!key || seen.has(key)) continue; seen.add(key); out.push(item); }
  return out;
}
async function fetchProvider(source, fetcher, timeoutMs = 8000) {
  if (!isAllowedProviderUrl(source.url)) throw new Error("Provider URL is not allowed");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const response = await fetcher(source.url, { signal: controller.signal, headers: { accept: source.kind === "rss" ? "application/rss+xml, application/atom+xml, text/xml" : "application/json" } }); if (!response.ok) throw new Error(`Provider HTTP ${response.status}`); const payload = source.kind === "rss" ? await response.text() : await response.json(); return source.kind === "rss" ? parseFeed(payload, source) : normalizeGeoJson(payload, source); }
  finally { clearTimeout(timer); }
}
async function searchCurrent(query, detection, options = {}) {
  const category = detection?.category || "general"; const windowName = detection?.requestedWindow || "latest"; const selected = sourcesFor(category); const providers = selected.map(source => source.id).sort().join(","); const key = `current|${normalize(query)}|${category}|${windowName}|${providers}`; const now = Date.now(); const cached = cache.get(key); const ttl = Math.min(...selected.map(source => source.ttlMs), 180_000);
  if (cached && now - cached.createdAt < ttl) { metrics.state.cache.hit += 1; selected.forEach(source => metrics.recordProvider(source.id, 0, true, 0, true)); return { ...cached.value, cacheHit: true }; }
  metrics.state.cache.miss += 1;
  const fetcher = options.fetcher || global.fetch; const results = await Promise.allSettled(selected.map(source => fetchProvider(source, fetcher, options.timeoutMs || 8000)));
  const errors = []; let items = [];
  results.forEach((result, index) => result.status === "fulfilled" ? (items = items.concat(result.value), metrics.recordProvider(selected[index].id, 0, true, result.value.length, false)) : (errors.push({ source: selected[index].id, message: "Provider unavailable" }), metrics.recordProvider(selected[index].id, 0, false, 0, false)));
  const cutoff = now - (WINDOWS[windowName] || 30) * 86400000;
  items = dedupe(items.filter(item => relevant(item, query, category)).filter(item => !item.publishedAt || Date.parse(item.publishedAt) >= cutoff).sort((a, b) => (TRUST[b.trust] || 0) - (TRUST[a.trust] || 0) || (Date.parse(b.publishedAt || 0) || 0) - (Date.parse(a.publishedAt || 0) || 0))).slice(0, 24);
  const sources = [...new Set(items.map(item => item.source))]; const value = { items, sources, providerErrors: errors, cacheHit: false, checkedAt: new Date(now).toISOString(), category, window: windowName, newestSourceAt: items.find(item => item.publishedAt)?.publishedAt || null };
  cache.set(key, { createdAt: now, value }); return value;
}
function clearCache() { cache.clear(); }

module.exports = { parseFeed, normalizeGeoJson, isAllowedProviderUrl, searchCurrent, clearCache, TRUST };
