"use strict";

const { cleanCurrentText } = require("./currentContentQuality");

const STOP = new Set("the a an and or of to in on for with from by is are was were has have had this that these those new latest today bugun bugunku guncel son ile ve bir bu su icin olarak olan oldu yeni".split(" "));
const NUMBER_WORDS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, bir: 1, iki: 2, uc: 3, üç: 3, dort: 4, dört: 4, bes: 5, beş: 5, alti: 6, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10 });
const QUANTITY = /\b(?:vulnerabilit(?:y|ies)|açık|acik|items?|systems?|events?|missions?|products?|models?|uydu|satellite|sources?|kaynak)\b/i;

function fold(value) { return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(); }
function tokens(value) { return [...new Set(fold(value).split(" ").filter(token => token.length > 2 && !STOP.has(token)))]; }
function sourceRefs(event) { return [...new Set([...(event.sourceRefs || []), ...(event.sources || []).map(source => source.url)].filter(Boolean))]; }
function independentDomains(event) { return new Set((event.sources || []).map(source => source.domain).filter(Boolean)).size || Math.min(sourceRefs(event).length, 1); }
function entities(value) {
  const text = String(value || ""); const found = new Set();
  for (const match of text.matchAll(/\b(?:CISA|NASA|ESA|NIST|USGS|MIT|Microsoft|Google|Apple|OpenAI|Artemis|Mars|Moon|Ay|CVE-\d{4}-\d{4,7})\b/gi)) found.add(match[0].toUpperCase());
  return [...found].slice(0, 8);
}
function numericValue(value) {
  const text = fold(value); if (!QUANTITY.test(text)) return null;
  const quantitySource = QUANTITY.source.replace(/^\\b|\\b\/?[a-z]*$/g, "");
  const digit = text.match(new RegExp(`\\b(\\d{1,3})\\s+(?:new\\s+)?(?:${quantitySource})`, "i")); if (digit) {
    const number = Number(digit[1]);
    if (number >= 1900 && number <= 2100) return null;
    if (/\bcve[- ]?\d/i.test(text.slice(Math.max(0, digit.index - 5), digit.index + digit[0].length + 2))) return null;
    return number;
  }
  for (const [word, number] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${word}\\s+(?:new\\s+)?(?:${quantitySource})`, "i").test(text)) return number;
  return null;
}
function claimType(text, number) {
  const value = fold(text);
  if (/cve|vulnerabil|exploit|security advisory|siber|guvenlik|acik/.test(value)) return "SECURITY_ALERT";
  if (/released|launched|published|announced|yayinladi|duyurdu|piyasaya surdu/.test(value)) return "RELEASE";
  if (/discovered|found|detected|kesfetti|bulundu|tespit/.test(value)) return "DISCOVERY";
  if (/completed|added|updated|removed|tamamladi|ekledi|guncelledi/.test(value)) return "STATUS_CHANGE";
  if (/\b(where|location|located|near|nerede|yakinin)\b/.test(value)) return "LOCATION";
  if (/\b(date|tarih|on \d{1,2}|\d{1,2} [a-z]+ 20\d{2})\b/.test(value)) return "DATE";
  if (number !== null) return /percent|km|magnitude|puan|oran|yuzde/.test(value) ? "MEASUREMENT" : "COUNT";
  return "GENERAL_FACT";
}
function atomicText(event) {
  const candidates = [event.summary, event.headline].map(value => cleanCurrentText(value, 280)).filter(Boolean);
  const sentence = candidates[0]?.split(/(?<=[.!?])\s+/).find(value => value.length >= 20) || candidates[0] || candidates[1] || "";
  return cleanCurrentText(sentence, 260);
}
function claimSignature(text, entityList) {
  const base = tokens(text).filter(token => !/^\d+$/.test(token) && !Object.hasOwn(NUMBER_WORDS, token));
  const entityTokens = entityList.flatMap(tokens); return [...new Set([...entityTokens, ...base])].sort().slice(0, 12).join("|");
}
function confidenceFor(authority, domains, conflict) {
  if (conflict) return "Sınırlı";
  if (domains >= 2 && authority >= 80) return "Yüksek";
  if (authority >= 95 || domains >= 2) return "Orta";
  return "Sınırlı";
}
function extractClaim(event, index = 0) {
  const text = atomicText(event); if (!text) return null;
  const refs = sourceRefs(event); if (!refs.length) return null;
  const entityList = entities(`${event.headline || ""} ${text}`); const number = numericValue(text); const domains = independentDomains(event);
  const authorities = (event.sources || []).map(source => Number(source.authority)).filter(Number.isFinite); const authority = authorities.length ? Math.max(...authorities) : 75;
  return { id: `claim-${index + 1}`, eventId: event.id || `event-${index + 1}`, text, normalizedText: fold(text), sourceRefs: refs, sourceCount: refs.length, independentDomains: domains, crossSourceSupport: domains, confidence: confidenceFor(authority, domains, false), claimType: claimType(text, number), numericValue: number, entities: entityList, claimKey: claimSignature(text, entityList), authority };
}
function similarity(left, right) {
  if (!left || !right) return 0; const a = new Set(left.split("|")); const b = new Set(right.split("|")); const shared = [...a].filter(value => b.has(value)).length; return shared / Math.max(1, Math.min(a.size, b.size));
}
function mergeClaims(claims) {
  const merged = [];
  for (const claim of claims) {
    const match = merged.find(value => similarity(value.claimKey, claim.claimKey) >= 0.72 && (value.numericValue === null || claim.numericValue === null || value.numericValue === claim.numericValue) && (!value.entities.length || !claim.entities.length || value.entities.some(entity => claim.entities.includes(entity))));
    if (!match) { merged.push({ ...claim }); continue; }
    match.sourceRefs = [...new Set([...match.sourceRefs, ...claim.sourceRefs])]; match.sourceCount = match.sourceRefs.length; match.independentDomains = Math.max(match.independentDomains, claim.independentDomains); match.crossSourceSupport = match.independentDomains; match.entities = [...new Set([...match.entities, ...claim.entities])]; match.confidence = confidenceFor(Math.max(match.authority, claim.authority), match.independentDomains, false);
  }
  return merged;
}
function contradictionsFor(claims) {
  const groups = [];
  for (let left = 0; left < claims.length; left += 1) for (let right = left + 1; right < claims.length; right += 1) {
    const a = claims[left]; const b = claims[right];
    if (a.numericValue === null || b.numericValue === null || a.numericValue === b.numericValue || similarity(a.claimKey, b.claimKey) < 0.58) continue;
    const key = [a.claimKey, b.claimKey].sort()[0]; let group = groups.find(item => item.claimKey === key);
    if (!group) { group = { claimKey: key, variants: [], sources: [] }; groups.push(group); }
    for (const claim of [a, b]) { if (!group.variants.some(value => value.numericValue === claim.numericValue)) group.variants.push({ text: claim.text, numericValue: claim.numericValue, sourceRefs: claim.sourceRefs }); group.sources.push(...claim.sourceRefs); claim.confidence = "Sınırlı"; claim.contradicted = true; }
    group.sources = [...new Set(group.sources)];
  }
  return groups;
}
function buildClaims(events = []) {
  const extracted = events.map(extractClaim).filter(Boolean); const contradictions = contradictionsFor(extracted); const claims = mergeClaims(extracted).filter((claim, index, list) => list.findIndex(value => value.normalizedText === claim.normalizedText && value.sourceRefs.join("|") === claim.sourceRefs.join("|")) === index);
  return { claims, contradictions };
}

module.exports = { fold, tokens, entities, numericValue, claimType, extractClaim, similarity, mergeClaims, contradictionsFor, buildClaims };
