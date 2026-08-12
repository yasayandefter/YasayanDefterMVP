"use strict";

const { sanitizeText } = require("./feedParser");

const NOISE = /\b(?:View CSAF|Expand All\s*\+?|Legal Notice|Privacy\s*&\s*Use Policy|Acknowledgments|Read more|Continue reading|Skip to content)\b/gi;
const HTML_LEAK = /<\/?[a-z][^>]*>|\b(?:href|target|class)\s*=|&nbsp;/i;
const PRESENTATION_PREFIX = /^(?:summary|description|overview|details)\s*(?::|[-—])?\s+(?!(?:of|for|from)\b)/i;
const SUBCATEGORIES = Object.freeze({
  MEDICAL_DEVICE: /medical device|healthcare product|patient|hospital|medikal|sağlık cihaz/,
  CYBERSECURITY: /\b(?:cve|vulnerability|exploit|malware|ransomware|cybersecurity|security advisory|kev|siber güvenlik|açık)\b/,
  AI: /\b(?:artificial intelligence|machine learning|deep learning|neural|large language model|generative ai|yapay zek[aâ]|makine öğren)\b/,
  SPACE_TECH: /\b(?:nasa|esa|spacecraft|satellite|lunar|orbit|rocket|artemis|space technology|uzay|uydu|roket)\b/,
  HARDWARE: /\b(?:chip|semiconductor|processor|hardware|device|sensor|donanım|işlemci)\b/,
  SOFTWARE: /\b(?:software|application|platform|operating system|developer|code|yazılım|uygulama)\b/,
  ROBOTICS: /\b(?:robot|robotics|autonomous system|automation|robotik)\b/,
  SCIENCE_TECH: /\b(?:research|scientist|laboratory|quantum|science|araştırma|bilim)\b/
});

function cleanHeadline(value) {
  return sanitizeText(value, 260).replace(NOISE, " ").replace(/\s+(?:\||—|-)\s+(?:CISA|NASA|NIST|MIT News|Microsoft Research)$/i, "").replace(/\s+/g, " ").trim().slice(0, 180);
}
function cleanCurrentText(value, maxLength = 320) {
  let text = sanitizeText(value, 4000).replace(NOISE, " ").replace(/(?:^|\s)[•▪◆►]+\s*/g, " ").replace(/\[\s*…\s*\]|\.\.\./g, "…").replace(/\s+/g, " ").trim().replace(PRESENTATION_PREFIX, "").trim();
  if (text.length <= maxLength) return text;
  const sentences = text.match(/[^.!?…]+[.!?…]+/g) || [];
  const complete = sentences.map(sentence => sentence.trim()).filter(sentence => sentence.length >= 30);
  const selected = []; let length = 0;
  for (const sentence of complete) { if (length + sentence.length > maxLength && selected.length) break; selected.push(sentence); length += sentence.length + 1; if (selected.length >= 3) break; }
  if (selected.length) return selected.join(" ").slice(0, maxLength).trim();
  return `${text.slice(0, Math.max(0, maxLength - 1)).replace(/[\s,;:]+$/g, "")}…`;
}
function classifySubcategory(item) {
  const text = `${item?.title || ""} ${item?.summary || item?.text || ""}`.toLocaleLowerCase("tr-TR");
  for (const [name, pattern] of Object.entries(SUBCATEGORIES)) if (pattern.test(text)) return name;
  return "GENERAL_TECH";
}
function whyItMatters(text) {
  const sentences = sanitizeText(text, 1800).split(/(?<=[.!?])\s+/).map(sentence => cleanCurrentText(sentence, 220));
  return sentences.find(sentence => /actively exploited|immediate action|update|patch|risk|critical|important|protect|güvenlik|risk|güncelle/i.test(sentence)) || "";
}
function qualityItem(item) {
  const title = cleanHeadline(item?.title); const summary = cleanCurrentText(item?.summary || item?.text || title);
  return { ...item, title, headline: title, summary, text: summary, snippet: summary, subcategory: classifySubcategory({ ...item, title, summary }), whyItMatters: whyItMatters(summary), rawContent: undefined, rawDescription: undefined, feedBody: undefined };
}
function rankDiverse(items, options = {}) {
  const genericTechnology = options.genericTechnology === true; const selected = []; const remaining = [...items]; const domainCounts = new Map(); const subcategoryCounts = new Map();
  while (remaining.length && selected.length < (options.limit || 20)) {
    const early = selected.length < 5;
    let index = remaining.findIndex(item => (options.specificCategory || !early || (domainCounts.get(item.domain) || 0) < 2) && (!genericTechnology || item.subcategory !== "MEDICAL_DEVICE" || (subcategoryCounts.get("MEDICAL_DEVICE") || 0) < 1) && (options.specificCategory || !early || (subcategoryCounts.get(item.subcategory) || 0) < 2));
    if (index < 0) index = remaining.findIndex(item => !early || (domainCounts.get(item.domain) || 0) < 2);
    if (index < 0) index = 0;
    const [item] = remaining.splice(index, 1); selected.push(item); domainCounts.set(item.domain, (domainCounts.get(item.domain) || 0) + 1); subcategoryCounts.set(item.subcategory, (subcategoryCounts.get(item.subcategory) || 0) + 1);
  }
  return selected;
}
function factFromEvent(event) { return { text: cleanCurrentText(event.summary || event.headline, 260), concept: event.headline, sourceRefs: event.sourceRefs || [], sourceCount: Number(event.sourceCount || event.crossSourceSupport) || 1, subcategory: event.subcategory }; }
function buildCurrentQuiz(events, claims = []) {
  const eligible = claims.filter(claim => !claim.contradicted && claim.confidence !== "Sınırlı" && claim.sourceRefs?.length).sort((a, b) => Number(b.crossSourceSupport) - Number(a.crossSourceSupport) || b.independentDomains - a.independentDomains || b.authority - a.authority);
  for (const claim of eligible) {
    if (Number.isFinite(claim.numericValue)) {
      const answer = String(claim.numericValue); const number = claim.numericValue; const options = [...new Set([Math.max(0, number - 1), number, number + 1, number + 2])].sort((a, b) => a - b).map(String);
      const question = /\bkev\b|known exploited vulnerabilities/i.test(claim.text) ? `${claim.entities?.[0] || "Kurum"} duyurusuna göre KEV kataloğuna kaç yeni güvenlik açığı eklendi?` : `${claim.entities?.[0] || "Kurum"} duyurusunda belirtilen sayı kaçtır?`;
      if (options.length === 4) return { question, type: "NUMERIC", options, correctAnswer: answer, correct: answer, claimRef: claim.id, sourceRefs: claim.sourceRefs, verified: true, supportLabel: claim.sourceCount === 1 ? "1 kaynak" : `${claim.sourceCount} kaynak` };
    }
    if (claim.entities?.length) {
      const answer = claim.entities[0]; const pool = ["NASA", "CISA", "NIST", "ESA", "USGS", "MIT"].filter(value => value !== answer); const options = [...new Set([answer, ...pool])].slice(0, 4);
      if (options.length === 4) return { question: `Hangi kurum bu doğrulanmış gelişmeyle ilişkilidir: “${cleanCurrentText(claim.text, 140)}”?`, type: "ENTITY", options, correctAnswer: answer, correct: answer, claimRef: claim.id, sourceRefs: claim.sourceRefs, verified: true, supportLabel: claim.sourceCount === 1 ? "1 kaynak" : `${claim.sourceCount} kaynak` };
    }
  }
  return null;
}
function buildCurrentLearning(events, query, claims = []) {
  const facts = claims.length ? claims.filter(claim => !claim.contradicted).map(claim => ({ text: claim.text, concept: claim.entities?.[0] || "Güncel gelişme", sourceRefs: claim.sourceRefs, sourceCount: claim.sourceCount, reliability: claim.confidence, claimRef: claim.id, subcategory: events.find(event => (event.id || "") === claim.eventId)?.subcategory })).slice(0, 8) : events.map(factFromEvent).filter(fact => fact.text).slice(0, 8); const headlines = events.slice(0, 4).map(event => event.headline);
  const simple = headlines.length ? `Bugünkü gelişmeler ${headlines.slice(0, 3).join("; ")} başlıklarında yoğunlaşıyor. Ayrıntılar doğrulanmış kaynak kartlarında yer alıyor.` : "";
  const detailed = events.slice(0, 5).map(event => event.contradictions?.length ? `${cleanHeadline(event.headline)}: Kaynaklar bu ayrıntıda farklı bilgi veriyor; kaynak varyantları birlikte değerlendirilmelidir.` : `${cleanHeadline(event.headline)}: ${cleanCurrentText(event.summary)}`).join("\n\n");
  const eventById = new Map(events.map(event => [event.id, event]));
  const flashcards = claims.filter(claim => !claim.contradicted && claim.confidence !== "Sınırlı").slice(0, 5).map(claim => {
    const event = eventById.get(claim.eventId); const title = cleanHeadline(event?.headline || ""); const subject = claim.entities?.[0] || title.replace(/\b(?:security|cybersecurity|medical device)\s+advisory\b/gi, "").replace(/\s+/g, " ").trim();
    const question = subject ? (/security|vulnerabil|exploit|risk|cve|kev|güvenlik|açık/i.test(`${claim.text} ${title}`) ? `${subject} güvenlik duyurusunda doğrulanan temel bilgi nedir?` : `${subject} ile ilgili doğrulanan temel bilgi nedir?`) : "Bu güvenlik gelişmesinde doğrulanan temel bilgi nedir?";
    return { question: cleanCurrentText(question, 220), answer: cleanCurrentText(claim.text, 300), claimRef: claim.id, sourceRefs: claim.sourceRefs, supportCount: claim.sourceCount, crossSourceSupport: claim.crossSourceSupport === true };
  });
  const nodes = [...new Set(events.flatMap(event => [event.subcategory, ...(event.sources || []).map(source => source.sourceName)].filter(Boolean)))].slice(0, 10).map(label => ({ label }));
  return { facts, quiz: buildCurrentQuiz(events, claims), flashcards, lesson: { topic: query, summary: simple, simple, detailed, analogy: "", examples: [], quiz: [], nextTopics: [] }, knowledgeMap: { center: query, nodes } };
}
function buildCurrentFollowUps(events) {
  const subcategories = new Set(events.map(event => event.subcategory)); const providers = new Set(events.flatMap(event => (event.sources || []).map(source => source.sourceName)));
  const questions = [];
  if (subcategories.has("CYBERSECURITY") || subcategories.has("MEDICAL_DEVICE")) questions.push("Bugünkü siber güvenlik gelişmelerini araştır.");
  if (subcategories.has("AI")) questions.push("Yapay zekâ alanındaki son haberleri araştır.");
  if (subcategories.has("SPACE_TECH") || [...providers].some(name => /NASA|ESA/i.test(name))) questions.push("NASA ve ESA'nın son teknoloji çalışmalarını araştır.");
  if (subcategories.has("HARDWARE")) questions.push("Bugünkü donanım ve çip gelişmelerini araştır.");
  if (events.some(event => event.contradictions?.length)) questions.push("Bu gelişmeyle ilgili kaynakları karşılaştır.");
  questions.push("Bugünkü teknoloji gelişmelerini farklı kaynaklardan araştır.");
  return [...new Set(questions)].slice(0, 4).map(text => ({ text, query: text }));
}
function assertPlainCurrent(value) { return !HTML_LEAK.test(JSON.stringify(value)); }
function eventReliability(event, claims = [], contradictions = []) { const eventClaims = claims.filter(claim => claim.eventId === event.id); const domains = Number(event.independentDomains) || 1; const official = (event.sources || []).filter(source => Number(source.authority) >= 95).length; const conflicted = eventClaims.some(claim => claim.contradicted) || contradictions.some(item => item.sources?.some(url => event.sourceRefs?.includes(url))); const score = Math.max(0, Math.min(100, 45 + Math.min(25, domains * 12) + Math.min(20, official * 8) - (conflicted ? 30 : 0))); return { score, label: conflicted ? "Sınırlı" : score >= 80 ? "Yüksek" : score >= 60 ? "Orta" : "Sınırlı", independentDomains: domains, officialSourceCount: official, contradicted: conflicted }; }

module.exports = { NOISE, HTML_LEAK, PRESENTATION_PREFIX, cleanHeadline, cleanCurrentText, classifySubcategory, whyItMatters, qualityItem, rankDiverse, factFromEvent, buildCurrentQuiz, buildCurrentLearning, buildCurrentFollowUps, assertPlainCurrent, eventReliability };
