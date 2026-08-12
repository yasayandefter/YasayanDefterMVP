"use strict";
const assert = require("node:assert/strict");
const quality = require("../brain/currentContentQuality");
const providers = require("../brain/currentProviders");
const intelligence = require("../brain/researchIntelligence");
const freshness = require("../brain/freshness");

const now = "2026-08-12T10:00:00.000Z";
const item = (providerId, sourceName, domain, title, summary, url, authority = 100) => quality.qualityItem({ providerId, sourceId: providerId, sourceName, source: sourceName, domain, title, summary, text: summary, url, publishedAt: now, updatedAt: now, authority, trust: authority >= 95 ? "official" : "institutional", language: "en", rawType: "rss", currentRelevanceVerified: true });
const cisaMarkup = `&lt;p class=&quot;intro&quot;&gt;CISA added 3 new vulnerabilities to the Known Exploited Vulnerabilities catalog.&lt;/p&gt;&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;a href=&quot;https://example.test/cve&quot; target=&quot;_blank&quot;&gt;CVE links&lt;/a&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;&nbsp; View CSAF Expand All + Legal Notice Privacy &amp; Use Policy Acknowledgments`;
const candidates = [
  item("cisa-1", "CISA", "cisa.gov", "CISA Adds 3 Known Exploited Vulnerabilities", cisaMarkup, "https://www.cisa.gov/1"),
  item("cisa-2", "CISA", "cisa.gov", "Medical device security advisory", "A medical device vulnerability affects healthcare products. Users should apply the vendor update.", "https://www.cisa.gov/2"),
  item("cisa-3", "CISA", "cisa.gov", "Cybersecurity advisory for industrial software", "A software vulnerability is actively exploited. Apply the security patch.", "https://www.cisa.gov/3"),
  item("nasa", "NASA Technology", "nasa.gov", "NASA completes lunar technology hardware", "NASA completed hardware for a lunar technology demonstration mission.", "https://www.nasa.gov/1"),
  item("ms", "Microsoft Research", "microsoft.com", "New artificial intelligence research system", "Researchers published a new artificial intelligence system and evaluation.", "https://www.microsoft.com/1", 88),
  item("nist", "NIST News", "nist.gov", "NIST publishes quantum technology research", "NIST published new quantum technology research results.", "https://www.nist.gov/1")
];

assert.equal(quality.HTML_LEAK.test(candidates[0].summary), false); assert.equal(/View CSAF|Expand All|Legal Notice|Acknowledgments/i.test(candidates[0].summary), false); assert.ok(candidates[0].summary.length <= 320);
const generic = quality.rankDiverse(candidates, { genericTechnology: true, limit: 6 });
assert.ok(generic.slice(0, 4).filter(value => value.domain === "cisa.gov").length <= 2); assert.ok(new Set(generic.slice(0, 4).map(value => value.subcategory)).size >= 3); assert.ok(generic.slice(0, 4).filter(value => value.subcategory === "MEDICAL_DEVICE").length <= 1);
const cyber = quality.rankDiverse(candidates.slice(0, 3), { specificCategory: true, limit: 3 }); assert.equal(cyber.filter(value => value.domain === "cisa.gov").length, 3);

const events = providers.clusterEvents(generic, 10); const query = "Bugün teknoloji dünyasında neler oldu?"; const detection = freshness.detectFreshness(query, new Date(now)); const context = intelligence.buildContext(query, detection); const dto = intelligence.enhanceResult(intelligence.createCurrentResult(query, { items: generic, events, sources: [...new Set(generic.map(value => value.sourceName))], providerErrors: [], checkedAt: now }, detection, context), context);
const serialized = JSON.stringify(dto); const banned = [/<\/?(?:p|a|table|ul|li|div)\b/i, /href=/i, /target=/i, /class=/i, /&nbsp;/i, /View CSAF/i, /Expand All/i, /Bilgiye daha hızlı ulaşmayı sağlar/i, /günlük hayatta kullandığın bir araç/i, /rawContent|rawDescription|feedBody/i];
for (const pattern of banned) assert.equal(pattern.test(serialized), false, String(pattern));
assert.equal(dto.currentState, "CURRENT_VERIFIED"); assert.ok(dto.events.every(event => event.summary.length <= 320 && event.sourceRefs.length === event.sourceCount)); assert.ok(dto.structuredContent.keyFacts.every(fact => fact.text.length <= 320 && fact.sourceRefs.length)); assert.equal(dto.ai.lesson.analogy, ""); assert.match(dto.ai.lesson.simple, /Bugünkü gelişmeler/); assert.equal(dto.brain.quiz.question.includes("temel açıklamaya göre"), false); assert.ok(dto.brain.flashcards.length > 0); assert.ok(dto.ai.knowledgeMap.nodes.length > 0); assert.ok(dto.reliability.highQualitySourceCount >= 3); assert.ok(new Set(dto.articles.map(value => value.reliabilityScore)).size > 1);
console.log("PASS  current HTML/noise cleanup, bounded event facts, generic/specific diversity, medical cap, current learning, quiz, flashcards, map, traceability, and official reliability");
