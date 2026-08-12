"use strict";

const BLOCKED_XML = /<!DOCTYPE|<!ENTITY/i;

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x"; const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }
    return named[entity.toLowerCase()] ?? " ";
  });
}

function sanitizeText(value, limit = 4000) {
  return decodeEntities(String(value || "").replace(/<!\[CDATA\[/gi, "").replace(/\]\]>/g, "")
    .replace(/<(script|style|iframe|object|embed|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim()).slice(0, limit);
}

function field(block, names) {
  for (const name of names) { const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i")); if (match) return match[1]; }
  return "";
}
function httpsUrl(value) { try { const url = new URL(sanitizeText(value, 2000)); return url.protocol === "https:" ? url.href : ""; } catch (_) { return ""; } }
function isoDate(value) { const time = Date.parse(sanitizeText(value, 200)); return Number.isFinite(time) ? new Date(time).toISOString() : null; }

function parseFeed(xml, provider) {
  const payload = String(xml || "");
  if (!payload.trim() || BLOCKED_XML.test(payload)) throw new Error("UNSAFE_OR_EMPTY_XML");
  const blocks = payload.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return blocks.slice(0, 100).map(block => {
    const atomLink = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
    const publishedAt = isoDate(field(block, ["pubDate", "published", "dc:date", "date"]));
    const updatedAt = isoDate(field(block, ["updated", "modified"]));
    const title = sanitizeText(field(block, ["title"]), 300);
    const summary = sanitizeText(field(block, ["description", "summary", "content:encoded", "content"]), 4000);
    const url = httpsUrl(atomLink || field(block, ["link", "guid"]));
    return {
      providerId: provider.id, sourceName: provider.name, domain: provider.domain, title, summary, url,
      publishedAt: publishedAt || updatedAt, updatedAt, category: provider.categories?.[0] || "general", language: provider.language || "en",
      authority: Number(provider.authority) || 0, rawType: provider.type || "rss",
      source: provider.name, sourceId: provider.id, trust: provider.authority >= 95 ? "official" : "institutional", text: summary
    };
  }).filter(item => item.title && item.url);
}

function parseGeoJson(payload, provider) {
  return (Array.isArray(payload?.features) ? payload.features : []).slice(0, 100).map(feature => {
    const properties = feature?.properties || {}; const publishedAt = Number.isFinite(Number(properties.time)) ? new Date(Number(properties.time)).toISOString() : null;
    const url = httpsUrl(properties.url); const title = sanitizeText(properties.title || properties.place || "Deprem", 300); const summary = sanitizeText(properties.place || "", 1000);
    return { providerId: provider.id, sourceName: provider.name, domain: provider.domain, title, summary, url, publishedAt, updatedAt: publishedAt, category: "earthquake", language: provider.language, authority: provider.authority, rawType: provider.type, source: provider.name, sourceId: provider.id, trust: "official", text: summary, magnitude: Number.isFinite(Number(properties.mag)) ? Number(properties.mag) : null, coordinates: feature?.geometry?.coordinates || null };
  }).filter(item => item.url && item.publishedAt);
}

module.exports = { BLOCKED_XML, decodeEntities, sanitizeText, isoDate, parseFeed, parseGeoJson };
