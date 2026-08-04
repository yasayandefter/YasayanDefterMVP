"use strict";

const STOP_WORDS = new Set("ve veya ile için olan olarak bir bu şu daha çok bilgi konu şey yapılan nedir nasıl neden gibi olanın tarafından üzerinde arasında the and for with from that this are was what how why into about".split(/\s+/));
const MAX_TEXT = 12000;
const MAX_SENTENCES = 80;
const MAX_CONCEPTS = 8;
const MAX_FACTS = 8;
const MAX_OUTPUT_BYTES = 50000;

function clean(value) {
  return String(value == null ? "" : value)
    .replace(/<(script|style|iframe|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

function normalizeResearchInput(input) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const articles = Array.isArray(value.articles) ? value.articles : [];
  return {
    topic: clean(value.topic || value.query || ""),
    articles: articles.slice(0, 24).map(article => ({
      title: clean(article?.title),
      text: clean(article?.text || article?.summary || article?.extract),
      url: clean(article?.url),
      source: clean(article?.source),
      domain: clean(article?.domain),
      publishedAt: clean(article?.publishedAt || article?.date),
      reliabilityScore: Number.isFinite(article?.reliabilityScore) ? article.reliabilityScore : null
    })).filter(article => article.title || article.text),
    usedFallback: Boolean(value.usedFallback || value.researchUnavailable),
    sourceCount: Number.isFinite(value.sourceCount) ? value.sourceCount : undefined
  };
}

function extractSentences(input) {
  const normalized = normalizeResearchInput(input);
  const seen = new Set();
  const sentences = [];
  for (const article of normalized.articles) {
    for (const part of `${article.title}. ${article.text}`.split(/(?<=[.!?。！？])\s+/)) {
      const value = clean(part);
      const key = tokens(value).slice(0, 24).sort().join("|");
      const nearDuplicate = [...seen].some(existing => {
        const left = new Set(existing.split("|"));
        const right = key.split("|").filter(Boolean);
        const overlap = right.filter(token => left.has(token)).length;
        return right.length >= 4 && overlap / right.length >= 0.85;
      });
      if (value.length >= 25 && key && !seen.has(key) && !nearDuplicate) {
        seen.add(key);
        sentences.push({ text: value, article });
      }
      if (sentences.length >= MAX_SENTENCES) return sentences;
    }
  }
  return sentences;
}

function tokens(text) {
  return clean(text).toLocaleLowerCase("tr-TR").split(/[^\p{L}\p{N}]+/u)
    .filter(token => token.length >= 4 && !STOP_WORDS.has(token) && !/^\d+$/.test(token) && !/^(https?|www|com|org|net|png|jpg|jpeg|svg|html)$/.test(token));
}

function selectSummarySentences(sentences, context = {}) {
  const topicTokens = tokens(context.topic || "");
  const scored = sentences.map((sentence, index) => {
    const words = tokens(sentence.text);
    const overlap = topicTokens.filter(token => words.includes(token)).length;
    const score = overlap * 4 + (sentence.text.length >= 50 ? 2 : 0) + (index === 0 ? 0.1 : 0);
    return { sentence, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const limit = context.audienceLevel === "child" ? 2 : 4;
  return scored.slice(0, Math.min(limit, scored.length)).sort((a, b) => a.index - b.index).map(item => shorten(item.sentence.text, context.audienceLevel));
}

function shorten(value, audienceLevel = "general") {
  const max = audienceLevel === "child" ? 180 : audienceLevel === "middle_school" ? 240 : audienceLevel === "high_school" ? 300 : 320;
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
}

function extractKeyConcepts(input, context = {}) {
  const normalized = normalizeResearchInput(input);
  const counts = new Map();
  for (const article of normalized.articles) {
    for (const token of tokens(`${article.title} ${article.text}`)) counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_CONCEPTS).map(([term]) => {
      const sentence = extractSentences({ ...normalized, articles: normalized.articles }).find(item => tokens(item.text).includes(term));
      return { term, definition: sentence ? sentence.text.slice(0, 220) : "" };
    }).filter(item => item.definition);
}

function domainFor(article) {
  if (article.domain) return article.domain.toLowerCase();
  try { return new URL(article.url).hostname.toLowerCase().replace(/^www\./, ""); } catch (_) { return article.source || ""; }
}

function ecosystem(domain) {
  return /wikipedia\.org|wikimedia\.org/.test(domain) ? "wikimedia-ecosystem" : domain;
}

function extractKeyFacts(input, context = {}) {
  const sentences = extractSentences(input);
  const facts = [];
  const seen = new Set();
  for (const item of sentences) {
    if (!/[0-9%]|\b(ilk|dördüncü|fourth|defined|tanımlanır|oluşur|bulunur|gezegen|sistem)\b/i.test(item.text)) continue;
    const key = item.text.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    const factTokens = new Set(tokens(item.text));
    const supporting = new Set([ecosystem(domainFor(item.article))].filter(Boolean));
    for (const article of normalizeResearchInput(input).articles) {
      const overlap = tokens(article.text).filter(token => factTokens.has(token)).length;
      if (overlap >= Math.min(3, Math.max(2, Math.ceil(factTokens.size * 0.2)))) {
        const domain = ecosystem(domainFor(article));
        if (domain) supporting.add(domain);
      }
    }
    const confidence = supporting.size >= 3 ? "high" : supporting.size === 2 ? "medium" : "limited";
    facts.push({ text: item.text.slice(0, 320), sourceCount: supporting.size, confidence, supportingSources: [...supporting].slice(0, 4) });
    if (facts.length >= MAX_FACTS) break;
  }
  return facts;
}

function buildSections(input, context = {}) {
  const sentences = extractSentences(input);
  const summary = selectSummarySentences(sentences, context);
  const sections = [];
  if (summary.length) sections.push({ id: "genel-bakis", title: "Genel Bakış", text: summary.join(" "), points: summary.slice(0, 3) });
  const details = sentences.filter(item => !summary.includes(item.text)).slice(0, 4).map(item => shorten(item.text, context.audienceLevel));
  if (details.length) sections.push({ id: "temel-bilgiler", title: "Temel Bilgiler", text: details.join(" "), points: details.slice(0, 3) });
  return sections;
}

function generateFollowUpQuestions(input, context = {}) {
  const topic = clean(context.topic || normalizeResearchInput(input).topic);
  if (!topic || !extractSentences(input).length) return [];
  const concepts = extractKeyConcepts(input, context).map(item => item.term).slice(0, 2);
  return [...new Set([`${topic} neden önemlidir?`, `${topic} nasıl oluşur veya çalışır?`, ...concepts.map(term => `${term} ile ${topic} arasındaki ilişki nedir?`)] )].slice(0, 4);
}

function buildStructuredContent(input, context = {}) {
  const normalized = normalizeResearchInput(input);
  const merged = { ...context, topic: context.topic || normalized.topic, audienceLevel: context.audienceLevel || "general" };
  const sentences = extractSentences(normalized);
  const summarySentences = selectSummarySentences(sentences, merged);
  const keyConcepts = extractKeyConcepts(normalized, merged);
  const keyFacts = extractKeyFacts(normalized, merged);
  const sections = buildSections(normalized, merged);
  const sourceCount = normalized.sourceCount ?? normalized.articles.length;
  const limitations = [];
  if (!normalized.articles.length || !sentences.length) limitations.push("Yeterli kaynak metni bulunamadı.");
  if (sourceCount <= 1) limitations.push("Yalnızca tek bağımsız kaynak bulundu.");
  if (normalized.usedFallback) limitations.push("İçerik yerel fallback verisiyle oluşturuldu.");
  if (normalized.articles.length && normalized.articles.every(article => !article.publishedAt)) limitations.push("Kaynaklarda yayın tarihi bulunmuyor.");
  if (!keyConcepts.length) limitations.push("Bazı kavramlar için yeterli tanım bağlamı yok.");
  const output = {
    version: "1.0",
    topic: merged.topic,
    audienceLevel: merged.audienceLevel,
    summary: summarySentences.join(" "),
    introduction: summarySentences[0] || "Bu konu için yeterli kaynak metni bulunamadı.",
    sections,
    keyConcepts,
    keyFacts,
    interestingFacts: keyFacts.slice(0, 2).map(fact => fact.text),
    followUpQuestions: generateFollowUpQuestions(normalized, merged),
    contentWarnings: [],
    limitations,
    generatedFrom: { sourceCount, articleCount: normalized.articles.length, usedFallback: normalized.usedFallback }
  };
  while (JSON.stringify(output).length > MAX_OUTPUT_BYTES && output.sections.length > 1) output.sections.pop();
  while (JSON.stringify(output).length > MAX_OUTPUT_BYTES && output.keyFacts.length > 1) output.keyFacts.pop();
  while (JSON.stringify(output).length > MAX_OUTPUT_BYTES && output.keyConcepts.length > 1) output.keyConcepts.pop();
  while (JSON.stringify(output).length > MAX_OUTPUT_BYTES && output.followUpQuestions.length > 1) output.followUpQuestions.pop();
  return output;
}

module.exports = { normalizeResearchInput, extractSentences, selectSummarySentences, extractKeyConcepts, extractKeyFacts, buildSections, generateFollowUpQuestions, buildStructuredContent };
