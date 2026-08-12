"use strict";

const BLOCKED_ACRONYMS = new Set(["AI", "MS", "IT", "US", "UK", "EU"]);
const TYPE_HINTS = Object.freeze([
  ["ORGANIZATION", /\b(?:agency|administration|institute|institution|university|laboratory|company|corporation|ajans[ıi]?|enstit[üu]s[üu]?|laboratuvar|kurumu?|bakanl[ıi]k)\b/i],
  ["MISSION", /\b(?:mission|görev|program|artemis|apollo)\b/i],
  ["MODEL", /\b(?:model|gpt|gemini|llama)\b/i],
  ["PRODUCT", /\b(?:product|platform|device|system|ürün|cihaz|sistem)\b/i],
  ["TECHNOLOGY", /\b(?:technology|teknoloji|artificial intelligence|yapay zek[aâ])\b/i],
  ["LOCATION", /\b(?:city|province|country|şehir|il|ülke)\b/i]
]);

function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function fold(value) { return clean(value).toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim(); }
function acronym(value) { return clean(value).split(/[\s&/-]+/).filter(word => /^[\p{L}\p{N}]/u.test(word)).map(word => word[0]).join("").toUpperCase(); }
function typeOf(value) { for (const [type, pattern] of TYPE_HINTS) if (pattern.test(value)) return type; return "PROGRAM"; }
function validAcronym(value) { return /^[A-Z][A-Z0-9]{1,9}$/.test(value) && !BLOCKED_ACRONYMS.has(value); }
function candidate(canonical, aliases, type, evidenceRefs, reason, confidence = 95) { return { canonical, aliases: [...new Set(aliases.map(clean).filter(Boolean))], type, confidence, evidenceRefs: [...new Set(evidenceRefs.filter(Boolean))], reason, persistent: false }; }
function extractCandidates(text, options = {}) {
  const value = clean(text); const evidenceRefs = options.evidenceRefs || []; const output = [];
  for (const match of value.matchAll(/\b([A-Z][A-Za-z0-9&,'’.-]*(?:\s+(?:and|of|for|the|ve|ile|[A-Z][A-Za-z0-9&,'’.-]*)){1,11})\s*\(([A-Z][A-Z0-9]{1,9})\)/g)) {
    const long = clean(match[1]); const short = match[2]; if (!validAcronym(short) || acronym(long) !== short) continue;
    output.push(candidate(short, [long, short], typeOf(long), evidenceRefs, "PARENTHETICAL_ACRONYM"));
  }
  for (const match of value.matchAll(/\b([A-Z][A-Z0-9]{1,9})\s*\(([A-Z][A-Za-z0-9&,'’.-]*(?:\s+(?:and|of|for|the|ve|ile|[A-Z][A-Za-z0-9&,'’.-]*)){1,11})\)/g)) {
    const short = match[1]; const long = clean(match[2]); if (!validAcronym(short) || acronym(long) !== short) continue;
    output.push(candidate(short, [long, short], typeOf(long), evidenceRefs, "ACRONYM_PARENTHETICAL"));
  }
  return output.filter((item, index, list) => list.findIndex(other => other.canonical === item.canonical && other.aliases.join("|") === item.aliases.join("|")) === index);
}
function normalizeNamedEntity(value) {
  const text = clean(value); const folded = fold(text);
  const mission = folded.match(/\b(artemis|apollo)\s+(\d+|i{1,3}|iv|v)\b/); if (mission) { const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 }; return `${mission[1].toUpperCase()}-${roman[mission[2]] || Number(mission[2])}`; }
  const product = folded.match(/\b(gpt|gemini|llama)\s*-?\s*(\d+(?:\.\d+)?)\b/); if (product) return `${product[1].toUpperCase()}-${product[2]}`;
  return text;
}
function buildRegistry(sources = []) {
  const candidates = []; for (const source of sources) candidates.push(...extractCandidates(`${source.title || ""} ${source.summary || source.text || ""}`, { evidenceRefs: [source.url] }));
  const grouped = new Map(); for (const item of candidates) { const key = item.canonical; if (!grouped.has(key)) grouped.set(key, { ...item }); else { const current = grouped.get(key); current.aliases = [...new Set([...current.aliases, ...item.aliases])]; current.evidenceRefs = [...new Set([...current.evidenceRefs, ...item.evidenceRefs])]; current.confidence = Math.min(100, current.confidence + (new Set(current.evidenceRefs.map(ref => { try { return new URL(ref).hostname; } catch { return ref; } })).size > 1 ? 5 : 0)); current.reason = "MULTI_SOURCE_ACRONYM_EVIDENCE"; } }
  const highConfidence = [...grouped.values()].filter(item => item.confidence >= 90); return { candidates: [...grouped.values()], highConfidence, rejected: candidates.length - highConfidence.length, aliases: new Map(highConfidence.flatMap(item => item.aliases.map(alias => [fold(alias), item.canonical]))) };
}
function applyAliases(value, registry) { let output = clean(value); const used = []; for (const [alias, canonical] of registry?.aliases || []) { if (alias.length < 3) continue; const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+")}\\b`, "gi"); if (pattern.test(fold(output))) { output = `${output} ${canonical}`; used.push(canonical); } } return { text: output, used: [...new Set(used)] }; }

module.exports = { BLOCKED_ACRONYMS, clean, fold, acronym, validAcronym, extractCandidates, normalizeNamedEntity, buildRegistry, applyAliases };
