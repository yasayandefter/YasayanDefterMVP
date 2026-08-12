"use strict";

const SOURCES = Object.freeze([
  { id: "usgs-earthquakes", name: "USGS Earthquake Hazards", domain: "earthquake.usgs.gov", categories: ["earthquake"], type: "geojson", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", language: "en", authority: 100, freshnessWindow: "day", timeoutMs: 6500, ttlMs: 45_000, maxBytes: 1_000_000 },
  { id: "nasa-news", name: "NASA News", domain: "nasa.gov", categories: ["science", "space", "general"], type: "rss", url: "https://www.nasa.gov/feed/", language: "en", authority: 100, freshnessWindow: "week", timeoutMs: 7000, ttlMs: 180_000, maxBytes: 600_000 },
  { id: "nasa-technology", name: "NASA Technology", domain: "nasa.gov", categories: ["technology", "science", "space"], type: "rss", url: "https://www.nasa.gov/technology/feed/", language: "en", authority: 100, freshnessWindow: "week", timeoutMs: 7000, ttlMs: 180_000, maxBytes: 600_000 },
  { id: "esa-space-news", name: "European Space Agency", domain: "esa.int", categories: ["space", "science", "general"], type: "rss", url: "https://www.esa.int/rssfeed/Our_Activities/Space_News", language: "en", authority: 100, freshnessWindow: "week", timeoutMs: 6500, ttlMs: 180_000, maxBytes: 300_000 },
  { id: "esa-space-technology", name: "ESA Space Engineering & Technology", domain: "esa.int", categories: ["space", "technology", "science"], type: "rss", url: "https://www.esa.int/rssfeed/Our_Activities/Space_Engineering_Technology", language: "en", authority: 100, freshnessWindow: "week", timeoutMs: 6500, ttlMs: 180_000, maxBytes: 300_000 },
  { id: "microsoft-research", name: "Microsoft Research", domain: "microsoft.com", categories: ["ai", "technology", "science"], type: "rss", url: "https://www.microsoft.com/en-us/research/feed/", language: "en", authority: 88, freshnessWindow: "week", timeoutMs: 7000, ttlMs: 240_000, maxBytes: 500_000 },
  { id: "mit-ai", name: "MIT News — Artificial Intelligence", domain: "mit.edu", categories: ["ai", "technology", "science"], type: "rss", url: "https://news.mit.edu/rss/topic/artificial-intelligence2", language: "en", authority: 94, freshnessWindow: "week", timeoutMs: 7000, ttlMs: 240_000, maxBytes: 700_000 },
  { id: "google-ai", name: "Google AI", domain: "blog.google", categories: ["ai", "technology"], type: "rss", url: "https://blog.google/technology/ai/rss/", language: "en", authority: 82, freshnessWindow: "week", timeoutMs: 7000, ttlMs: 240_000, maxBytes: 300_000 },
  { id: "nist-news", name: "NIST News", domain: "nist.gov", categories: ["technology", "science", "general"], type: "rss", url: "https://www.nist.gov/news-events/news/rss.xml", language: "en", authority: 100, freshnessWindow: "week", timeoutMs: 6500, ttlMs: 240_000, maxBytes: 300_000 },
  { id: "cisa-advisories", name: "CISA Cybersecurity Advisories", domain: "cisa.gov", categories: ["technology", "cybersecurity"], type: "rss", url: "https://www.cisa.gov/cybersecurity-advisories/all.xml", language: "en", authority: 100, freshnessWindow: "week", timeoutMs: 6500, ttlMs: 180_000, maxBytes: 700_000 }
]);

function sourceById(id) { return SOURCES.find(source => source.id === id) || null; }
function sourcesFor(categories) {
  const requested = new Set(Array.isArray(categories) ? categories : [categories || "general"]);
  return SOURCES.filter(source => source.categories.some(category => requested.has(category)));
}
function isAllowedProviderUrl(value, sourceId) {
  try {
    const url = new URL(value); const candidates = sourceId ? [sourceById(sourceId)].filter(Boolean) : SOURCES;
    return url.protocol === "https:" && candidates.some(source => url.href === new URL(source.url).href);
  } catch (_) { return false; }
}
function isAllowedRedirect(value, source) {
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === source.domain || url.hostname.endsWith(`.${source.domain}`)); } catch (_) { return false; }
}

module.exports = { SOURCES, sourceById, sourcesFor, isAllowedProviderUrl, isAllowedRedirect };
