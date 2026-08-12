"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const freshness = require("../brain/freshness");
const intelligence = require("../brain/researchIntelligence");
const currentQuality = require("../brain/currentContentQuality");
const currentClaims = require("../brain/currentClaims");
const claimSignatures = require("../brain/claimSignatures");
const adaptiveAliases = require("../brain/adaptiveAliases");
const eventFamilies = require("../brain/eventFamilies");
const currentSources = require("../brain/currentSources");
const feedParser = require("../brain/feedParser");
const metrics = require("../brain/metrics");
const currentProviders = require("../brain/currentProviders");

const now = new Date("2026-08-12T12:00:00.000Z");
const contextFor = query => intelligence.buildContext(query, freshness.detectFreshness(query, now));

const standard = [
  ["Atatürk kimdir?", "PERSON"],
  ["Kara delik nasıl oluşur?", "HOW_IT_WORKS"],
  ["Fotosentez nasıl gerçekleşir?", "HOW_IT_WORKS"],
  ["Toryum nedir?", "DEFINITION"],
  ["Mars", "SPACE"],
  ["Roma İmparatorluğu", "HISTORY"],
  ["İnsan kalbi nasıl çalışır?", "HOW_IT_WORKS"],
  ["Python nedir?", "DEFINITION"],
  ["Güneş Sistemi nedir?", "DEFINITION"],
  ["DNA nedir?", "DEFINITION"]
];
for (const [query, intent] of standard) {
  const context = contextFor(query);
  assert.equal(context.mode, "standard", query);
  assert.equal(context.intent, intent, query);
  assert.equal(context.query, query, query);
  assert.ok(context.normalizedQuery && context.expansions.length <= 3, query);
}

for (const query of ["Java", "Mercury", "Apple", "Tesla"]) {
  const context = contextFor(query);
  assert.equal(context.disambiguation.ambiguous, true, query);
  assert.equal(context.disambiguation.selectedSense, null, query);
  assert.ok(context.disambiguation.note, query);
}
assert.equal(contextFor("Python").intent, "TECHNOLOGY");
assert.equal(contextFor("Mars").disambiguation.selectedSense, "Mars gezegeni");

for (const query of [
  "Mars ile Dünya arasındaki farklar",
  "Python ile JavaScript karşılaştırması",
  "Yapay zekâ ile makine öğrenmesi arasındaki fark",
  "Güneş ile Dünya karşılaştırması"
]) {
  const context = contextFor(query);
  const comparison = intelligence.buildComparison(query, context.intent, [{ text: `${query} için doğrulanmış karşılaştırma.` }]);
  assert.equal(context.intent, "COMPARISON", query);
  assert.equal(comparison.entities.length, 2, query);
  assert.notEqual(comparison.entities[0], comparison.entities[1], query);
}

const currentQuery = "Bugün teknoloji dünyasında neler oldu?";
const currentContext = contextFor(currentQuery);
assert.equal(currentContext.mode, "current");
assert.equal(currentContext.query, currentQuery);
assert.equal(freshness.detectFreshness(currentQuery, now).category, "technology");

const empty = intelligence.enhanceResult(intelligence.createCurrentResult(currentQuery, {
  items: [], sources: [], providerErrors: [], checkedAt: now.toISOString()
}, freshness.detectFreshness(currentQuery, now), currentContext), currentContext);
assert.equal(empty.currentState, "CURRENT_EMPTY");
assert.equal(empty.currentSourceCount, 0);
assert.deepEqual(empty.structuredContent.keyFacts, []);
assert.deepEqual(empty.brain.flashcards, []);
assert.equal(empty.brain.quiz, null);
assert.equal(empty.ai.lesson, null);

const fixtureText = "<p>Summary CISA added three new vulnerabilities to the KEV Catalog.</p> View CSAF";
const cleaned = currentQuality.cleanCurrentText(fixtureText);
assert.match(cleaned, /^CISA added three new vulnerabilities/);
assert.doesNotMatch(cleaned, /<|>|View CSAF|Summary CISA/i);
const item = {
  providerId: "cisa-advisories", sourceName: "CISA", source: "CISA", domain: "cisa.gov",
  title: "CISA adds three vulnerabilities to the KEV Catalog", summary: cleaned, text: cleaned,
  url: "https://www.cisa.gov/news-events/alerts/example", publishedAt: "2026-08-12T10:00:00.000Z",
  authority: 100, trust: "official", currentRelevanceVerified: true, subcategory: "CYBERSECURITY"
};
const event = { id: "event-1", headline: item.title, summary: item.summary, publishedAt: item.publishedAt,
  subcategory: item.subcategory, sourceRefs: [item.url], sourceCount: 1, independentDomains: 1,
  sources: [{ sourceName: item.sourceName, domain: item.domain, url: item.url, title: item.title,
    summary: item.summary, publishedAt: item.publishedAt, authority: item.authority }] };
const claimResult = currentClaims.buildClaims([event]);
const quiz = currentQuality.buildCurrentQuiz([event], claimResult.claims);
assert.equal(claimResult.claims.length, 1);
assert.equal(claimResult.claims[0].numericValue, 3);
assert.ok(claimResult.claims[0].sourceRefs.length);
assert.equal(quiz.verified, true);
assert.deepEqual(quiz.options, ["2", "3", "4", "5"]);
assert.equal(new Set(quiz.options).size, 4);
assert.equal(quiz.options.filter(value => value === quiz.correctAnswer).length, 1);

const aliases = adaptiveAliases.buildRegistry([{ title: "National Institute of Standards and Technology (NIST)", summary: "NIST published guidance.", url: "https://nist.gov/a" }]);
assert.ok(aliases.candidates.some(candidate => candidate.canonical === "NIST" && candidate.confidence >= 90));
assert.equal(adaptiveAliases.extractCandidates("Apple is a fruit used in food.").length, 0);
assert.equal(adaptiveAliases.normalizeNamedEntity("Artemis II"), adaptiveAliases.normalizeNamedEntity("Artemis 2"));
assert.equal(adaptiveAliases.normalizeNamedEntity("GPT-5"), adaptiveAliases.normalizeNamedEntity("GPT 5"));

const claim = (id, text, numericValue, sourceRef) => ({ id, eventId: `event-${id}`, text, numericValue,
  sourceRefs: [sourceRef], authority: 100, signature: claimSignatures.signature(text, { publishedAt: now.toISOString() }) });
const family = eventFamilies.buildFamilies([], [
  claim("a", "CISA added 3 vulnerabilities to the KEV Catalog.", 3, "https://a.gov/1"),
  claim("b", "CISA KEV kataloğuna 5 yeni güvenlik açığı ekledi.", 5, "https://b.gov/2")
])[0];
assert.equal(family.contradictions[0].type, "NUMERIC_CONFLICT");
assert.equal(currentQuality.buildCurrentQuiz([], family.claims), null);

assert.equal(claimSignatures.normalizeDomain("science.nasa.gov"), "nasa.gov");
assert.equal(claimSignatures.normalizeDomain("www.nasa.gov"), "nasa.gov");
assert.equal(currentSources.isAllowedProviderUrl("https://127.0.0.1/feed"), false);
assert.equal(currentSources.isAllowedProviderUrl("javascript:alert(1)"), false);
assert.equal(currentSources.isAllowedRedirect("https://localhost/private", currentSources.SOURCES[0]), false);
assert.throws(() => feedParser.parseFeed("<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///etc/passwd'>]><rss>&e;</rss>", currentSources.SOURCES[1]), /UNSAFE/);

const repeated = Array.from({ length: 5 }, () => JSON.stringify(contextFor(currentQuery), (key, value) => key === "checkedAt" ? "TIME" : value));
assert.equal(new Set(repeated).size, 1);
const cache = currentProviders.cacheStats();
assert.ok(cache.queryEntries <= cache.maxQueryEntries);
assert.ok(cache.feedEntries <= cache.maxFeedEntries);
metrics.reset(); metrics.recordResearch("CURRENT_NEWS", 2); metrics.recordClaims(claimResult.claims, [], quiz);
const metricText = JSON.stringify(metrics.summary());
assert.equal(metricText.includes(currentQuery), false);
assert.equal(metricText.includes(fixtureText), false);
const researchSource = fs.readFileSync(require.resolve("../brain/research"), "utf8");
const serverSource = fs.readFileSync(require.resolve("../server"), "utf8");
assert.doesNotMatch(researchSource, /console\.log\("🔎 Araştırılıyor:",\s*query\)/);
assert.doesNotMatch(serverSource, /"Araştırma sorguları:",\s*researchQueries/);

console.log("PASS  final research quality gate: standard/ambiguous/comparison/current matrices, empty/verified safety, quiz, aliases, contradictions, SSRF/XXE, repetition, and metrics privacy");
