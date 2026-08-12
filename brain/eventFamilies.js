"use strict";

const signatures = require("./claimSignatures");

function familySignature(claim) { const value = claim.signature || {}; return { ...value, numericValues: [], dateBucket: null, normalizedKeywords: (value.normalizedKeywords || []).filter(token => !/^\d+$/.test(token)) }; }
function statusOf(text) { const value = signatures.fold(text); if (/\b(?:completed|finished|tamamlandi|tamamladi)\b/.test(value)) return "COMPLETED"; if (/\b(?:delayed|postponed|ertelendi|gecikti)\b/.test(value)) return "DELAYED"; if (/\b(?:cancelled|canceled|iptal edildi)\b/.test(value)) return "CANCELLED"; return ""; }
function explicitDates(text) { const value = String(text || ""); return [...new Set([...value.matchAll(/\b(?:0?[1-9]|[12]\d|3[01])\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Oca(?:k)?|Şub(?:at)?|Mar(?:t)?|Nis(?:an)?|May(?:ıs)?|Haz(?:iran)?|Tem(?:muz)?|Ağu(?:stos)?|Eyl(?:ül)?|Eki(?:m)?|Kas(?:ım)?|Ara(?:lık)?)\b/gi)].map(match => match[0].toLocaleLowerCase("tr-TR")))]; }
function severity(type) { return type === "STATUS_CONFLICT" ? "HIGH" : type === "NUMERIC_CONFLICT" ? "HIGH" : type === "DATE_CONFLICT" ? "MEDIUM" : "LOW"; }
function contradictionFor(claims) {
  const output = [];
  for (let i = 0; i < claims.length; i += 1) for (let j = i + 1; j < claims.length; j += 1) {
    const a = claims[i]; const b = claims[j]; const variants = [];
    if (Number.isFinite(a.numericValue) && Number.isFinite(b.numericValue) && a.numericValue !== b.numericValue) variants.push(["NUMERIC_CONFLICT", a.numericValue, b.numericValue]);
    const datesA = explicitDates(a.text); const datesB = explicitDates(b.text); if (datesA.length && datesB.length && !datesA.some(date => datesB.includes(date))) variants.push(["DATE_CONFLICT", datesA.join(", "), datesB.join(", ")]);
    const statusA = statusOf(a.text); const statusB = statusOf(b.text); if (statusA && statusB && statusA !== statusB) variants.push(["STATUS_CONFLICT", statusA, statusB]);
    for (const [type, left, right] of variants) output.push({ id: `conflict-${output.length + 1}`, type, severity: severity(type), claimRefs: [a.id, b.id], variants: [{ claimRef: a.id, value: left, text: a.text, sourceRefs: a.sourceRefs }, { claimRef: b.id, value: right, text: b.text, sourceRefs: b.sourceRefs }], sources: [...new Set([...a.sourceRefs, ...b.sourceRefs])], note: "Kaynaklar bu ayrıntıda farklı bilgi veriyor." });
  }
  return output;
}
function buildFamilies(events = [], claims = []) {
  const families = [];
  for (const claim of claims) { const sig = familySignature(claim); let family = families.find(item => signatures.match(item.signature, sig).matched); if (!family) { family = { familyId: `family-${families.length + 1}`, topic: (sig.objectEntities || []).join(" / "), subject: (sig.subjectEntities || []).join(" / "), action: sig.action, signature: sig, claims: [], contradictions: [], sources: [], eventIds: [] }; families.push(family); } family.claims.push(claim); family.sources.push(...claim.sourceRefs); family.eventIds.push(claim.eventId); }
  for (const family of families) { family.sources = [...new Set(family.sources)]; family.eventIds = [...new Set(family.eventIds)]; family.contradictions = contradictionFor(family.claims); const conflicted = new Set(family.contradictions.flatMap(item => item.claimRefs)); for (const claim of family.claims) if (conflicted.has(claim.id)) { claim.contradicted = true; claim.confidence = "Sınırlı"; } }
  return families;
}

module.exports = { familySignature, statusOf, explicitDates, contradictionFor, buildFamilies };
