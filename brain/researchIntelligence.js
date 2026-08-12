"use strict";

const sourceReliability = require("./sourceReliability");

const STOP = new Set("ve veya ile icin için nedir nasil nasıl neden kimdir ne nasilca hakkında hakkinda bir bu su şu mi mı mu mü the and for with what how why".split(/\s+/));
const INTENTS = Object.freeze(["DEFINITION", "EXPLANATION", "HOW_IT_WORKS", "HISTORY", "PERSON", "PLACE", "SCIENCE", "COMPARISON", "CAUSE_EFFECT", "CURRENT_NEWS", "CURRENT_EVENT", "EARTHQUAKE", "SPACE", "TECHNOLOGY", "GENERAL"]);

function cleanText(value, limit = 12000) {
  return String(value == null ? "" : value)
    .replace(/<(script|style|iframe|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, limit);
}

function fold(value) {
  return cleanText(value).toLocaleLowerCase("tr-TR").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function normalizeQuery(value) {
  const original = cleanText(value, 500).replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, "");
  const searchTerms = fold(original).split(/\s+/).filter(token => token.length > 1 && !STOP.has(token)).slice(0, 16);
  return { original, normalized: fold(original), searchTerms, safeSearch: searchTerms.join(" ") || fold(original) };
}

function classifyIntent(query, freshness = {}) {
  const text = normalizeQuery(query).normalized;
  if (/deprem|earthquake|sarsinti/.test(text)) return "EARTHQUAKE";
  if (freshness.requiresFreshness && /haber|news|bugun|bu hafta|bu ay/.test(text)) return "CURRENT_NEWS";
  if (freshness.requiresFreshness) return "CURRENT_EVENT";
  if (/\b(karsilastir|karsilastirmasi|fark|farklar|arasindaki)\b/.test(text) && /\b(ile|ve|arasindaki)\b/.test(text)) return "COMPARISON";
  if (/\b(nasil olusur|nasil gerceklesir|nasil calisir|mekanizma|asama)\b/.test(text)) return "HOW_IT_WORKS";
  if (/\b(neden|sebep|sonuc|etki|yol acar)\b/.test(text)) return "CAUSE_EFFECT";
  if (/\b(kimdir|hayati|biyografi|calismalari)\b/.test(text)) return "PERSON";
  if (/\b(tarih|tarihi|imparator\w*|savas|donem|yuzyil)\b|\b(?:1[0-9]{3}|20[0-9]{2})\b/.test(text)) return "HISTORY";
  if (/\b(nedir|ne demek|tanim)\b/.test(text)) return "DEFINITION";
  if (/\b(acikla|anlat|ne ise yarar)\b/.test(text)) return "EXPLANATION";
  if (/\b(nerede|ulke|sehir|kent|bolge)\b/.test(text)) return "PLACE";
  if (/\b(uzay|gezegen|mars|kara delik|yildiz|nasa)\b/.test(text)) return "SPACE";
  if (/\b(teknoloji|yapay zeka|yazilim|bilgisayar|python|javascript)\b/.test(text) || (/\bjava\b/.test(text) && /program|yazilim|kod/.test(text))) return "TECHNOLOGY";
  if (/\b(fizik|kimya|biyoloji|fotosentez|dna|bilim)\b/.test(text)) return "SCIENCE";
  return "GENERAL";
}

const ENGLISH_EXPANSIONS = [
  [/kara delik/gi, "black hole"], [/olusum|oluşum/gi, "formation"],
  [/fotosentez/gi, "photosynthesis"], [/dunya|dünya/gi, "earth"],
  [/yapay zeka|yapay zekâ/gi, "artificial intelligence"], [/deprem/gi, "earthquake"]
];

function expandQuery(query, intent) {
  const normalized = normalizeQuery(query);
  const base = normalized.safeSearch;
  const candidates = [base];
  if (intent === "HOW_IT_WORKS") candidates.push(`${base} oluşumu`, `${base} mekanizması`);
  else if (intent === "HISTORY" || intent === "PERSON") candidates.push(`${base} tarihi`);
  else if (intent === "COMPARISON") candidates.push(`${base} karşılaştırma`);
  else if (intent === "CURRENT_NEWS" || intent === "CURRENT_EVENT") candidates.push(`${base} son gelişmeler`);
  let english = base;
  for (const [pattern, replacement] of ENGLISH_EXPANSIONS) english = english.replace(pattern, replacement);
  if (english !== base) candidates.push(english);
  return [...new Set(candidates.map(value => cleanText(value)).filter(Boolean))].slice(0, 3);
}

const AMBIGUITIES = {
  mars: { senses: ["gezegen", "marka/kişi"], context: { SPACE: "Mars gezegeni", SCIENCE: "Mars gezegeni" } },
  apple: { senses: ["teknoloji şirketi", "meyve"], context: { TECHNOLOGY: "Apple teknoloji şirketi" } },
  java: { senses: ["programlama dili", "Endonezya adası", "kahve"], context: { TECHNOLOGY: "Java programlama dili" } },
  mercury: { senses: ["Merkür gezegeni", "cıva elementi", "kişi/marka"], context: { SPACE: "Mercury planet", SCIENCE: "mercury element" } },
  tesla: { senses: ["Nikola Tesla", "otomotiv şirketi", "manyetik alan birimi"], context: { PERSON: "Nikola Tesla", TECHNOLOGY: "Tesla şirketi", SCIENCE: "tesla manyetik alan birimi" } }
};

function disambiguate(query, intent) {
  const normalized = normalizeQuery(query).normalized;
  const key = Object.keys(AMBIGUITIES).find(name => normalized.split(" ").includes(name));
  if (!key) return { ambiguous: false, entity: null, selectedSense: null, alternatives: [], note: "" };
  const entry = AMBIGUITIES[key];
  const contextualIntent = intent === "COMPARISON" && /mars/.test(normalized) && /(dunya|gezegen)/.test(normalized) ? "SPACE" : intent;
  const explicit = entry.context[contextualIntent] || null;
  return { ambiguous: !explicit && normalized.split(" ").length <= 2, entity: key, selectedSense: explicit, alternatives: entry.senses, note: explicit ? "" : "Bu sorgu birden fazla anlama gelebilir; sonuçlar en yaygın anlam üzerinden sıralandı." };
}

function tokenSet(value) { return new Set(fold(value).split(" ").filter(token => token.length > 2 && !STOP.has(token))); }
function overlapScore(left, right) { const a = tokenSet(left); const b = tokenSet(right); if (!a.size || !b.size) return 0; return [...a].filter(token => b.has(token)).length / Math.min(a.size, b.size); }

function relevanceScore(item, context) {
  const query = context.disambiguation.selectedSense || context.normalizedQuery;
  const title = cleanText(item?.title);
  const body = cleanText(item?.text || item?.summary || item?.snippet);
  let score = Math.round(overlapScore(query, title) * 55 + overlapScore(query, `${title} ${body}`) * 35);
  if (item?.language === "tr") score += 8;
  if (context.intent === "SPACE" && /gezegen|planet|space|uzay|nasa|solar|gunes sistemi/i.test(`${title} ${body}`)) score += 12;
  if (context.intent === "TECHNOLOGY" && /software|program|teknoloji|computer|şirket|sirket|yazilim/i.test(`${title} ${body}`)) score += 10;
  if (context.disambiguation.entity === "mars" && /chocolate|cikolata|company|champ de mars/i.test(title)) score -= 60;
  return Math.max(0, Math.min(100, score));
}

function fingerprint(value) { return [...tokenSet(value)].sort().slice(0, 40).join("|"); }

function prepareSources(items, context) {
  const scored = sourceReliability.rankSources(Array.isArray(items) ? items : [], { query: context.normalizedQuery, sources: items });
  const seenUrl = new Set(); const seenContent = [];
  return scored.map(item => ({ ...item, relevanceScore: relevanceScore(item, context), qualityScore: item.reliabilityScore }))
    .filter(item => item.relevanceScore >= (context.normalizedQuery.split(" ").length === 1 ? 8 : 12) || item.sourceType === "government" || item.trust === "official")
    .filter(item => {
      const urlKey = item.canonicalUrl || `${item.domain}|${fold(item.title)}`;
      const contentKey = fingerprint(`${item.title} ${item.snippet}`);
      if (!urlKey || seenUrl.has(urlKey) || seenContent.some(key => overlapScore(key, contentKey) >= 0.9)) return false;
      seenUrl.add(urlKey); if (contentKey) seenContent.push(contentKey); return true;
    }).sort((a, b) => b.relevanceScore - a.relevanceScore || b.qualityScore - a.qualityScore).slice(0, 20);
}

function dedupeFacts(facts, sources = []) {
  const selected = [];
  for (const raw of Array.isArray(facts) ? facts : []) {
    const fact = typeof raw === "string" ? { text: raw } : { ...(raw || {}) };
    fact.text = cleanText(fact.text, 400); if (fact.text.length < 20) continue;
    if (selected.some(existing => overlapScore(existing.text, fact.text) >= 0.78)) continue;
    fact.sourceRefs = [...new Set([...(fact.sourceRefs || []), ...(fact.supportingSources || [])].filter(Boolean))].slice(0, 5);
    if (!fact.sourceRefs.length) fact.sourceRefs = sources.filter(source => overlapScore(fact.text, `${source.title} ${source.snippet || source.text || ""}`) >= 0.2).map(source => source.canonicalUrl || source.url).filter(Boolean).slice(0, 5);
    selected.push(fact); if (selected.length >= 10) break;
  }
  return selected;
}

function detectContradictions(facts) {
  const conflicts = [];
  for (let i = 0; i < facts.length; i += 1) for (let j = i + 1; j < facts.length; j += 1) {
    const left = facts[i].text; const right = facts[j].text;
    if (overlapScore(left.replace(/\d+(?:[.,]\d+)?/g, ""), right.replace(/\d+(?:[.,]\d+)?/g, "")) < 0.55) continue;
    const a = left.match(/\d+(?:[.,]\d+)?/g) || []; const b = right.match(/\d+(?:[.,]\d+)?/g) || [];
    if (a.length && b.length && a.join("|") !== b.join("|")) conflicts.push({ statementA: left, statementB: right, note: "Kaynaklar bu konuda farklı rakamlar veriyor." });
  }
  return conflicts.slice(0, 3);
}

function prepareImages(images, context) {
  const seen = new Set();
  return (Array.isArray(images) ? images : []).map(item => typeof item === "string" ? { image: item, title: "" } : { ...(item || {}) })
    .map(item => {
      const url = cleanText(item.image || item.url || item.thumburl, 2000);
      const canonical = cleanText(item.original || url, 2000).replace(/\/thumb\/(.+?)\/\d+px-[^/?]+/i, "/$1").replace(/\?.*$/, "");
      return { ...item, image: url, imageRelevanceScore: Math.round(overlapScore(context.disambiguation.selectedSense || context.normalizedQuery, item.title || "") * 100), _key: canonical.toLowerCase() };
    }).filter(item => item.image && /^https?:\/\//i.test(item.image) && !/logo|icon|placeholder|\.svg(?:\?|$)/i.test(`${item.title} ${item.image}`))
    .filter(item => { if (!item._key || seen.has(item._key)) return false; seen.add(item._key); return true; })
    .sort((a, b) => b.imageRelevanceScore - a.imageRelevanceScore)
    .slice(0, 6).map(({ _key, ...item }) => item);
}

function buildTimeline(sources, intent) {
  if (!["HISTORY", "PERSON", "CURRENT_NEWS", "CURRENT_EVENT", "EARTHQUAKE"].includes(intent)) return [];
  return sources.map(source => ({ date: source.publishedAt || source.updatedAt || null, title: source.title, sourceRef: source.canonicalUrl || source.url }))
    .filter(item => item.date && Number.isFinite(Date.parse(item.date)))
    .map(item => ({ ...item, date: new Date(item.date).toISOString() }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(-10);
}

function buildComparison(query, intent, facts) {
  if (intent !== "COMPARISON") return null;
  const match = cleanText(query).match(/^(.+?)\s+(?:ile|ve)\s+(.+?)\s+(?:arasındaki\s+)?(?:farklar|farkı|karşılaştırması|karşılaştırma)/i);
  if (!match) return { entities: [], features: [], note: "Karşılaştırma öğeleri güvenle ayrıştırılamadı." };
  return { entities: [cleanText(match[1], 80), cleanText(match[2], 80)], features: facts.slice(0, 8).map(fact => ({ feature: fact.text, sourceRefs: fact.sourceRefs || [] })) };
}

function sectionTitles(intent) {
  if (intent === "HOW_IT_WORKS") return ["Nedir?", "Nasıl oluşur veya çalışır?", "Temel aşamalar", "Neden önemlidir?"];
  if (intent === "PERSON") return ["Kimdir?", "Hayatı", "Çalışmaları", "Önemi"];
  if (["CURRENT_NEWS", "CURRENT_EVENT", "EARTHQUAKE"].includes(intent)) return ["Son durum", "Öne çıkan gelişmeler", "Güncellik notu"];
  if (intent === "COMPARISON") return ["Karşılaştırma özeti", "Temel farklar"];
  return ["Kısa özet", "Temel bilgiler", "Neden önemlidir?"];
}

function enhanceResult(result, context) {
  const value = result && typeof result === "object" ? result : {};
  const sources = prepareSources(value.articles, context);
  const structured = value.structuredContent && typeof value.structuredContent === "object" ? value.structuredContent : {};
  const facts = dedupeFacts(structured.keyFacts || value.brain?.facts || [], sources);
  const contradictions = detectContradictions(facts);
  const images = prepareImages(value.images, context);
  const limitations = [...new Set([...(structured.limitations || []), context.disambiguation.note, contradictions.length ? "Kaynaklar bazı ayrıntılarda farklı bilgi veriyor." : "", !sources.length ? "Bu konuda yeterli güvenilir kaynak bulunamadı." : "", !images.length ? "Görsel bulunamadı." : "", sources.length && sources.every(item => item.language && item.language !== "tr") ? "Yalnızca İngilizce kaynak bulundu." : ""].filter(Boolean))];
  const checkedAt = context.checkedAt || new Date().toISOString();
  const timeline = buildTimeline(sources, context.intent);
  const comparison = buildComparison(context.query, context.intent, facts);
  const sectionNames = sectionTitles(context.intent);
  const existingSections = Array.isArray(structured.sections) ? structured.sections : [];
  const sections = existingSections.map((section, index) => ({ ...section, title: sectionNames[index] || section.title })).slice(0, sectionNames.length);
  const reliability = sourceReliability.summarizeReliability(sources);
  reliability.crossSourceAgreement = contradictions.length ? "mixed" : sources.length > 1 ? "supported" : "limited";
  reliability.label = reliability.level === "high" ? "Yüksek" : reliability.level === "medium" ? "Orta" : "Sınırlı";
  value.query = context.query;
  value.normalizedQuery = context.normalizedQuery;
  value.intent = context.intent;
  value.mode = context.mode;
  value.checkedAt = checkedAt;
  value.queryExpansions = context.expansions;
  value.disambiguation = context.disambiguation;
  value.articles = sources;
  value.images = images;
  value.sources = [...new Set(sources.map(source => source.source || source.domain).filter(Boolean))];
  value.sourceDetails = sources.map(source => ({ title: source.title, name: source.source, url: source.canonicalUrl || source.url, domain: source.domain, publishedAt: source.publishedAt || null, qualityScore: source.qualityScore, relevanceScore: source.relevanceScore }));
  value.reliability = reliability;
  value.timeline = timeline;
  value.comparison = comparison;
  value.contradictions = contradictions;
  value.limitations = limitations;
  value.structuredContent = { ...structured, sections, keyFacts: facts, timeline, comparison, limitations, intent: context.intent, mode: context.mode, checkedAt };
  return value;
}

function buildContext(query, freshness) {
  const normalized = normalizeQuery(query); const intent = classifyIntent(query, freshness);
  return { query: normalized.original, normalizedQuery: normalized.normalized, safeSearch: normalized.safeSearch, searchTerms: normalized.searchTerms, intent, mode: freshness?.requiresFreshness ? "current" : "standard", expansions: expandQuery(query, intent), disambiguation: disambiguate(query, intent), checkedAt: new Date().toISOString() };
}

module.exports = { INTENTS, cleanText, fold, normalizeQuery, classifyIntent, expandQuery, disambiguate, relevanceScore, prepareSources, dedupeFacts, detectContradictions, prepareImages, buildTimeline, buildComparison, sectionTitles, enhanceResult, buildContext };
