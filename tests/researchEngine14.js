"use strict";

const assert = require("node:assert/strict");
const intelligence = require("../brain/researchIntelligence");
const freshness = require("../brain/freshness");

const now = new Date("2026-08-12T12:00:00.000Z");
const matrix = [
  ["Atatürk kimdir?", "PERSON", "standard"],
  ["Kara delik nasıl oluşur?", "HOW_IT_WORKS", "standard"],
  ["Fotosentez nasıl gerçekleşir?", "HOW_IT_WORKS", "standard"],
  ["Mars", "SPACE", "standard"],
  ["Apple nedir?", "DEFINITION", "standard"],
  ["Roma İmparatorluğu", "HISTORY", "standard"],
  ["Mars ile Dünya arasındaki farklar", "COMPARISON", "standard"],
  ["Python ile JavaScript karşılaştırması", "COMPARISON", "standard"],
  ["Bugün teknoloji dünyasında neler oldu?", "CURRENT_NEWS", "current"],
  ["Bugünkü bilim haberleri", "CURRENT_NEWS", "current"],
  ["Son deprem nerede oldu?", "EARTHQUAKE", "current"],
  ["Yapay zekâ alanındaki son gelişmeler", "CURRENT_EVENT", "current"],
  ["Java", "GENERAL", "standard"],
  ["Mercury", "GENERAL", "standard"],
  ["Tesla", "GENERAL", "standard"]
];

for (const [query, intent, mode] of matrix) {
  const detection = freshness.detectFreshness(query, now);
  const context = intelligence.buildContext(query, detection);
  assert.equal(context.intent, intent, query);
  assert.equal(context.mode, mode, query);
  assert.ok(context.normalizedQuery);
  assert.ok(context.expansions.length > 0 && context.expansions.length <= 3);
}
assert.equal(freshness.detectFreshness("Atatürk 1938'de ne oldu?", now).mode, "standard");
assert.equal(intelligence.buildContext("Java", freshness.detectFreshness("Java", now)).disambiguation.ambiguous, true);
assert.equal(intelligence.buildContext("Mars ile Dünya arasındaki farklar", freshness.detectFreshness("Mars ile Dünya arasındaki farklar", now)).disambiguation.selectedSense, "Mars gezegeni");

const context = intelligence.buildContext("Mars gezegeni", freshness.detectFreshness("Mars gezegeni", now));
const enhanced = intelligence.enhanceResult({
  query: "Mars gezegeni",
  articles: [
    { title: "Mars", text: "Mars Güneş Sistemi'nin dördüncü gezegenidir. Mars'ın çapı yaklaşık 6.779 kilometredir.", url: "https://tr.wikipedia.org/wiki/Mars?utm_source=test", source: "Wikipedia", language: "tr" },
    { title: "Mars", text: "Mars Güneş Sistemi'nin dördüncü gezegenidir. Mars'ın çapı yaklaşık 6.780 kilometredir.", url: "https://tr.wikipedia.org/wiki/Mars", source: "Wikipedia", language: "tr" },
    { title: "Mars chocolate company", text: "Mars is a chocolate company.", url: "https://example.com/mars", source: "Example", language: "en" }
  ],
  images: [
    { title: "Mars planet photo", image: "https://upload.wikimedia.org/thumb/a/mars/800px-mars.jpg", original: "https://upload.wikimedia.org/a/mars.jpg" },
    { title: "Mars planet photo", image: "https://upload.wikimedia.org/thumb/a/mars/1200px-mars.jpg", original: "https://upload.wikimedia.org/a/mars.jpg" },
    { title: "Mars logo", image: "https://example.org/logo.svg" }
  ],
  structuredContent: {
    summary: "Mars, Güneş Sistemi'nin dördüncü gezegenidir.",
    sections: [{ title: "Genel", text: "Mars kayasal bir gezegendir." }],
    keyFacts: [
      { text: "Mars'ın çapı yaklaşık 6.779 kilometredir.", supportingSources: ["wikipedia.org"] },
      { text: "Mars'ın çapı yaklaşık 6.779 kilometredir.", supportingSources: ["wikipedia.org"] },
      { text: "Mars'ın çapı yaklaşık 6.780 kilometredir.", supportingSources: ["science.example"] }
    ], limitations: []
  }
}, context);

assert.equal(enhanced.mode, "standard");
assert.equal(enhanced.articles.some(item => /chocolate/i.test(item.title)), false);
assert.equal(new Set(enhanced.articles.map(item => item.canonicalUrl)).size, enhanced.articles.length);
assert.ok(enhanced.structuredContent.keyFacts.length <= 2);
assert.equal(enhanced.images.length, 1);
assert.ok(enhanced.sourceDetails.every(item => /^https?:\/\//.test(item.url)));
assert.ok(enhanced.reliability && enhanced.reliability.label);
assert.ok(Array.isArray(enhanced.limitations));

const comparisonContext = intelligence.buildContext("Mars ile Dünya arasındaki farklar", freshness.detectFreshness("Mars ile Dünya arasındaki farklar", now));
const comparison = intelligence.buildComparison(comparisonContext.query, comparisonContext.intent, [{ text: "Mars daha küçük bir gezegendir.", sourceRefs: ["wikipedia.org"] }]);
assert.deepEqual(comparison.entities, ["Mars", "Dünya"]);

const contradictions = intelligence.detectContradictions([
  { text: "Olayda 12 kişi etkilendi." },
  { text: "Olayda 15 kişi etkilendi." }
]);
assert.equal(contradictions.length, 1);

console.log(`PASS  Research Engine 14 deterministic intent, freshness, expansion, ambiguity, relevance, dedup, contradiction, image, comparison, traceability, and DTO matrix (${matrix.length} queries)`);
