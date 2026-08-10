"use strict";

const SOURCES = [
  { id: "usgs-earthquakes", name: "USGS Earthquake Hazards", kind: "geojson", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", categories: ["earthquake"], trust: "official", ttlMs: 45_000 },
  { id: "nasa-breaking", name: "NASA Breaking News", kind: "rss", url: "https://www.nasa.gov/rss/dyn/breaking_news.rss", categories: ["science", "space", "technology", "general"], trust: "official", ttlMs: 180_000 }
];

function sourcesFor(category) { return SOURCES.filter(source => source.categories.includes(category) || source.categories.includes("general")); }
function isAllowedProviderUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && SOURCES.some(source => new URL(source.url).hostname === url.hostname && source.url === value);
  } catch (_) { return false; }
}

module.exports = { SOURCES, sourcesFor, isAllowedProviderUrl };
