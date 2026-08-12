"use strict";
const adaptiveAliases = require("./adaptiveAliases");

const ACTIONS = Object.freeze([
  ["ADD", /\b(?:add(?:ed|s|ing)?|include(?:d|s)?|ekle(?:di|ndi|nir|yen)|dahil edildi)\b/i],
  ["RELEASE", /\b(?:release(?:d|s)?|launch(?:ed|es)?|publish(?:ed|es)?|announc(?:ed|es)|duyur(?:du|uldu)|yayinla(?:di|ndi)|piyasaya surdu|lansman)\b/i],
  ["DISCOVERY", /\b(?:discover(?:ed|s)?|found|identified|detect(?:ed|s)?|kesfet(?:ti|ildi)|tespit (?:etti|edildi)|bulundu)\b/i],
  ["COMPLETE", /\b(?:complete(?:d|s)?|finish(?:ed|es)?|tamamla(?:di|ndi))\b/i],
  ["ALERT", /\b(?:warn(?:ed|s)?|alert(?:ed|s)?|advisory|uyar(?:di|ildi)|uyari yayinladi)\b/i],
  ["UPDATE", /\b(?:patch(?:ed|es)?|fix(?:ed|es)?|update(?:d|s)?|yamalandi|duzeltildi|guncellendi)\b/i],
  ["CONFIRM", /\b(?:confirm(?:ed|s)?|dogrula(?:di|ndi)|teyit (?:etti|edildi))\b/i]
]);
const ENTITY_ALIASES = Object.freeze([
  ["NASA", /\b(?:NASA|National Aeronautics and Space Administration)\b/i],
  ["CISA", /\b(?:CISA|Cybersecurity and Infrastructure Security Agency)\b/i],
  ["MIT", /\b(?:MIT|Massachusetts Institute of Technology)\b/i],
  ["ESA", /\b(?:ESA|European Space Agency)\b/i],
  ["NIST", /\b(?:NIST|National Institute of Standards and Technology)\b/i],
  ["USGS", /\b(?:USGS|United States Geological Survey)\b/i],
  ["MICROSOFT", /\bMicrosoft\b/i], ["GOOGLE", /\bGoogle\b/i], ["APPLE", /\bApple\b/i]
]);
const TOPICS = Object.freeze([
  ["AI", /\b(?:AI|artificial intelligence|yapay zeka|machine learning|makine ogrenmesi)\b/i],
  ["CYBERSECURITY", /\b(?:cybersecurity|cyber security|siber guvenlik)\b/i],
  ["VULNERABILITY", /\b(?:vulnerabilit(?:y|ies)|security flaw|guvenlik acigi|aciklar?)\b/i],
  ["SPACECRAFT", /\b(?:spacecraft|uzay araci)\b/i], ["MISSION", /\b(?:mission|gorev)\b/i],
  ["MODEL", /\b(?:model|modeli)\b/i], ["KEV", /\b(?:KEV|Known Exploited Vulnerabilities)\b/i],
  ["MOON", /\b(?:Moon|Lunar|Ay)\b/i], ["MARS", /\bMars\b/i], ["WINDOWS", /\bWindows\b/i]
]);
const NUMBER_WORDS = Object.freeze({ one: 1, bir: 1, two: 2, iki: 2, three: 3, uc: 3, four: 4, dort: 4, five: 5, bes: 5, six: 6, alti: 6, seven: 7, yedi: 7, eight: 8, sekiz: 8, nine: 9, dokuz: 9, ten: 10, on: 10 });
const QUANTITIES = "vulnerabilit(?:y|ies)|security flaws?|guvenlik acig(?:i|lari)?|acig(?:i|lar)?|items?|systems?|events?|missions?|products?|models?|sources?|kaynak(?:lar)?";
const STOP = new Set("the a an and or of to in on for with from by is are was were has have had this that these those new latest today bir bu ve veya ile icin olarak olan yeni son guncel".split(" "));
const OBJECT_CONFLICTS = [["MOON", "MARS"], ["AI", "WINDOWS"]];
const ORG_DOMAINS = Object.freeze({ "nasa.gov": "nasa.gov", "science.nasa.gov": "nasa.gov", "www.nasa.gov": "nasa.gov", "cisa.gov": "cisa.gov", "www.cisa.gov": "cisa.gov", "nist.gov": "nist.gov", "www.nist.gov": "nist.gov", "esa.int": "esa.int", "www.esa.int": "esa.int", "mit.edu": "mit.edu", "news.mit.edu": "mit.edu" });

function fold(value) { return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(); }
function matches(dictionary, value) { const text = fold(value); return dictionary.filter(([, pattern]) => pattern.test(text)).map(([name]) => name); }
function numberValues(value) { const text = fold(value); const values = []; for (const match of text.matchAll(new RegExp(`\\b(\\d{1,3})\\s+(?:new\\s+|yeni\\s+)?(?:${QUANTITIES})\\b`, "gi"))) { const number = Number(match[1]); if (!(number >= 1900 && number <= 2100) && !/cve-?$/.test(text.slice(Math.max(0, match.index - 5), match.index))) values.push(number); } for (const [word, number] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${word}\\s+(?:new\\s+|yeni\\s+)?(?:${QUANTITIES})\\b`).test(text)) values.push(number); return [...new Set(values)]; }
function normalizeDomain(value) { const host = String(value || "").toLowerCase().replace(/^https?:\/\//, "").split(/[/:]/)[0].replace(/^www\./, ""); if (ORG_DOMAINS[host]) return ORG_DOMAINS[host]; for (const [domain, parent] of Object.entries(ORG_DOMAINS)) if (host === domain || host.endsWith(`.${parent}`)) return parent; const parts = host.split(".").filter(Boolean); return parts.length > 2 ? parts.slice(-2).join(".") : host; }
function dateBucket(value) { const time = Date.parse(value); return Number.isFinite(time) ? Math.floor(time / 86400000) : null; }
function languageOf(value) { const text = String(value || ""); return /[çğıöşü]|\b(?:yapay zek[aâ]|güvenlik|ekledi|yayınlandı|tamamladı|görev|duyurdu)\b/i.test(text) ? "tr" : /[a-z]/i.test(text) ? "en" : ""; }
function signature(text, metadata = {}) {
  const aliasResult = adaptiveAliases.applyAliases(text, metadata.aliasRegistry); const normalized = fold(aliasResult.text); const action = matches(ACTIONS, normalized)[0] || "GENERAL"; const subjectEntities = matches(ENTITY_ALIASES, normalized); const objectEntities = matches(TOPICS, normalized); const namedEntities = [...String(text || "").matchAll(/\b(?:Artemis|Apollo|GPT|Gemini|Llama)[ -]?(?:\d+|[IVX]+)\b/gi)].map(match => adaptiveAliases.normalizeNamedEntity(match[0])); const numericValues = numberValues(normalized); const canonicalEntities = [...new Set([...subjectEntities, ...namedEntities, ...aliasResult.used])]; const normalizedKeywords = [...new Set([...canonicalEntities, ...objectEntities, ...normalized.split(" ").filter(token => token.length > 3 && !STOP.has(token) && !Object.hasOwn(NUMBER_WORDS, token) && !/^\d+$/.test(token))])].sort().slice(0, 24);
  return { action, subjectEntities: canonicalEntities, objectEntities, numericValues, dates: [], category: metadata.category || "", language: metadata.language || languageOf(text), canonicalEntities, entityAliasesUsed: aliasResult.used, aliasConfidence: aliasResult.used.length ? 95 : 0, normalizedKeywords, dateBucket: dateBucket(metadata.publishedAt), canonical: [action, ...canonicalEntities, ...objectEntities, ...numericValues.map(String)].join("|") };
}
function overlap(left, right) { const a = new Set(left); const b = new Set(right); if (!a.size || !b.size) return 0; return [...a].filter(value => b.has(value)).length / Math.min(a.size, b.size); }
function conflict(left, right) {
  if (left.numericValues.length && right.numericValues.length && !left.numericValues.some(value => right.numericValues.includes(value))) return "numeric-conflict";
  for (const [a, b] of OBJECT_CONFLICTS) if ((left.objectEntities.includes(a) && right.objectEntities.includes(b)) || (left.objectEntities.includes(b) && right.objectEntities.includes(a))) return "object-conflict";
  if (left.subjectEntities.length && right.subjectEntities.length && !left.subjectEntities.some(value => right.subjectEntities.includes(value))) return "subject-conflict";
  return "";
}
function match(left, right) {
  const blocked = conflict(left, right); if (blocked) return { matched: false, score: 0, matchReasons: [], rejectedReason: blocked };
  let score = 0; const matchReasons = [];
  if (left.action !== "GENERAL" && left.action === right.action) { score += 25; matchReasons.push("action"); }
  const entityScore = overlap(left.subjectEntities, right.subjectEntities); if (entityScore) { score += 25 * entityScore; matchReasons.push("subject-entity"); }
  const topicScore = overlap(left.objectEntities, right.objectEntities); if (topicScore) { score += 25 * topicScore; matchReasons.push("topic"); }
  if (left.numericValues.length && right.numericValues.length && left.numericValues.some(value => right.numericValues.includes(value))) { score += 15; matchReasons.push("number"); }
  const keywordScore = overlap(left.normalizedKeywords, right.normalizedKeywords); if (keywordScore >= 0.25) { score += Math.min(15, keywordScore * 20); matchReasons.push("keywords"); }
  if (left.dateBucket !== null && right.dateBucket !== null && Math.abs(left.dateBucket - right.dateBucket) <= 3) { score += 10; matchReasons.push("date-proximity"); }
  return { matched: score >= 55, score: Math.round(score), matchReasons, rejectedReason: score >= 55 ? "" : "below-threshold" };
}

module.exports = { ACTIONS, ENTITY_ALIASES, TOPICS, NUMBER_WORDS, fold, numberValues, normalizeDomain, languageOf, signature, match, conflict, overlap };
