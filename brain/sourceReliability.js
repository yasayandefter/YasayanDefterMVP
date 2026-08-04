"use strict";

const WEIGHTS = Object.freeze({ relevance: 35, quality: 25, content: 15, freshness: 10, support: 15 });
const LEVELS = Object.freeze({ high: 80, medium: 60, limited: 40 });
const TRACKING_KEYS = /^(utm_|fbclid$|gclid$|ref$|source$)/i;

function text(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeText(value) {
  return text(value).toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function parseUrl(value) {
  try {
    const parsed = new URL(value);
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const params = [...parsed.searchParams.entries()]
      .filter(([key]) => !TRACKING_KEYS.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? `?${new URLSearchParams(params)}` : "";
    const pathname = parsed.pathname.replace(/\/+$|^$/, match => match === "/" ? "/" : "");
    return { domain, canonicalUrl: `https://${domain}${pathname}${query}` };
  } catch (_) {
    return { domain: "", canonicalUrl: "" };
  }
}

function classifySource(source) {
  const item = typeof source === "string" ? { source } : (source || {});
  const parsed = parseUrl(item.url || "");
  const domain = normalizeText(item.domain || parsed.domain);
  const label = normalizeText(`${item.source || ""} ${item.publisher || ""} ${item.title || ""} ${item.snippet || item.text || ""}`);
  if (domain.includes("wikipedia.org") || label.includes("wikipedia")) return "encyclopedia";
  if (domain.includes("wikimedia.org") || label.includes("wikimedia")) return "organization";
  if (/\.(gov|gov\.tr)$/.test(domain) || /\b(resmi kurum|bakanlik|government|official)\b/.test(label)) return "government";
  if (/\.(edu|edu\.tr)$/.test(domain) || /\b(university|universite|college|academic)\b/.test(label)) return "education";
  if (/\b(journal|doi|research|bilimsel|scientific|pubmed)\b/.test(label)) return "scientific";
  if (/\b(news|haber|gazete|times|reuters|bbc)\b/.test(label)) return "news";
  if (/\b(community|forum|reddit|wikipedia talk)\b/.test(label)) return "community";
  if (/\b(shop|store|product|satis|satin al|commercial)\b/.test(label)) return "commercial";
  if (item.source || item.publisher) return "organization";
  return "unknown";
}

function normalizeSource(source) {
  const item = typeof source === "string" ? { source, title: source } : { ...(source || {}) };
  const parsed = parseUrl(item.url || "");
  const domain = text(item.domain || parsed.domain).toLowerCase().replace(/^www\./, "");
  const sourceType = item.sourceType || classifySource({ ...item, domain });
  return {
    ...item,
    title: text(item.title || item.name || item.source),
    url: text(item.url),
    domain,
    snippet: text(item.snippet || item.text || item.summary || item.extract).slice(0, 2000),
    sourceType,
    language: text(item.language),
    publishedAt: item.publishedAt || item.date || "",
    canonicalUrl: parsed.canonicalUrl,
    source: text(item.source || item.publisher)
  };
}

function independentDomainKey(domain) {
  const value = String(domain || "").toLowerCase();
  if (value.endsWith("wikipedia.org") || value.endsWith("wikimedia.org")) return "wikimedia-ecosystem";
  return value;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function levelFor(score) {
  if (score >= LEVELS.high) return "high";
  if (score >= LEVELS.medium) return "medium";
  if (score >= LEVELS.limited) return "limited";
  return "low";
}

function scoreSource(source, context = {}) {
  const item = normalizeSource(source);
  const query = normalizeText(context.query || context.topic || "");
  const tokens = query.split(/\s+/).filter(token => token.length > 2);
  const haystack = normalizeText(`${item.title} ${item.snippet}`);
  const titleText = normalizeText(item.title);
  const matched = tokens.filter(token => haystack.includes(token)).length;
  const titleMatched = tokens.filter(token => titleText.includes(token)).length;
  const relevance = tokens.length ? clamp(10 + (matched / tokens.length) * 18 + (titleMatched / tokens.length) * 7) : 18;
  const qualityBase = { government: 24, scientific: 23, academic: 23, education: 22, encyclopedia: 20, news: 17, organization: 15, commercial: 8, community: 7, unknown: 8 }[item.sourceType] || 8;
  const quality = clamp(qualityBase + (item.publisher ? 1 : 0) - (item.canonicalUrl ? 0 : 2));
  const content = clamp((item.title ? 5 : 0) + (item.snippet.length >= 120 ? 7 : item.snippet.length >= 40 ? 4 : item.snippet.length ? 2 : 0) + (item.canonicalUrl ? 3 : 0));
  let freshness = 5;
  if (item.publishedAt) {
    const age = Date.now() - Date.parse(item.publishedAt);
    if (Number.isFinite(age) && age >= 0) freshness = age < 365 * 86400000 ? 10 : age < 5 * 365 * 86400000 ? 7 : 4;
  }
  const domains = new Set((context.sources || []).map(value => independentDomainKey(normalizeSource(value).domain)).filter(Boolean));
  const independent = item.domain && domains.has(independentDomainKey(item.domain)) ? Math.max(0, domains.size - 1) : domains.size;
  const support = clamp(5 + Math.min(10, independent * 3));
  const scoreBreakdown = { relevance, quality, content, freshness, support };
  const score = clamp(relevance * WEIGHTS.relevance / 35 + quality * WEIGHTS.quality / 25 + content * WEIGHTS.content / 15 + freshness * WEIGHTS.freshness / 10 + support * WEIGHTS.support / 15);
  const reasons = [];
  if (titleMatched) reasons.push("Konu başlığıyla eşleşiyor.");
  if (item.sourceType === "government" || item.sourceType === "scientific" || item.sourceType === "education") reasons.push("Kurumsal veya bilimsel kaynak sinyali taşıyor.");
  if (item.snippet.length < 40) reasons.push("İçerik özeti kısa.");
  if (!item.canonicalUrl) reasons.push("Geçerli kaynak URL'si bulunamadı.");
  return { ...item, score, reliabilityScore: score, reliabilityLevel: levelFor(score), scoreBreakdown, reliabilityReasons: reasons };
}

function rankSources(sources = [], context = {}) {
  const normalized = sources.map(source => scoreSource(source, { ...context, sources })).filter(Boolean);
  const seen = new Set();
  const unique = normalized.filter(item => {
    const key = item.canonicalUrl || `${item.domain}|${normalizeText(item.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const remaining = unique.sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
  const ranked = [];
  const domainCounts = new Map();
  while (remaining.length) {
    const index = remaining.findIndex(item => !item.domain || (domainCounts.get(item.domain) || 0) < 2);
    const [item] = remaining.splice(index < 0 ? 0 : index, 1);
    ranked.push(item);
    if (item.domain) domainCounts.set(item.domain, (domainCounts.get(item.domain) || 0) + 1);
  }
  return ranked;
}

function summarizeReliability(scoredSources = []) {
  const items = Array.isArray(scoredSources) ? scoredSources : [];
  const domains = new Set(items.map(item => independentDomainKey(item.domain)).filter(Boolean));
  const score = items.length ? clamp(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0;
  return {
    score,
    level: levelFor(score),
    sourceCount: items.length,
    independentDomainCount: domains.size,
    highQualitySourceCount: items.filter(item => item.score >= LEVELS.high).length
  };
}

module.exports = { normalizeSource, classifySource, scoreSource, rankSources, summarizeReliability, WEIGHTS, LEVELS };
