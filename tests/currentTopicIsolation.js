"use strict";

const assert = require("node:assert/strict");
const freshness = require("../brain/freshness");
const intelligence = require("../brain/researchIntelligence");

const query = "Bugün teknoloji dünyasında neler oldu?";
const detection = freshness.detectFreshness(query, new Date("2026-08-12T12:00:00.000Z"));
const context = intelligence.buildContext(query, detection);

assert.equal(detection.mode, "current");
assert.equal(detection.category, "technology");
assert.equal(context.query, query);
assert.equal(context.normalizedQuery, "bugun teknoloji dunyasinda neler oldu");
assert.ok(context.expansions.every(value => !/toryum|mars|atatürk/i.test(value)));

function assertCleanEmpty(result) {
  const serialized = JSON.stringify(result).toLocaleLowerCase("tr-TR");
  assert.equal(result.mode, "current");
  assert.equal(result.currentState, "CURRENT_EMPTY");
  assert.equal(result.query, query);
  assert.equal(result.originalQuery, query);
  assert.equal(result.title, query);
  assert.equal(result.brain.category, "Teknoloji");
  assert.equal(result.currentSourceCount, 0);
  assert.equal(result.freshness.sourceCount, 0);
  assert.equal(result.reliability.sourceCount, 0);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.images, []);
  assert.deepEqual(result.structuredContent.keyFacts, []);
  assert.deepEqual(result.structuredContent.keyConcepts, []);
  assert.deepEqual(result.brain.flashcards, []);
  assert.equal(result.brain.quiz, null);
  assert.equal(result.ai.quiz, null);
  assert.deepEqual(result.ai.knowledgeMap.nodes, []);
  for (const forbidden of ["toryum", "mars", "atatürk", "wikipedia"]) assert.equal(serialized.includes(forbidden), false, forbidden);
}

const empty = intelligence.enhanceResult(intelligence.createCurrentResult(query, { items: [], sources: [], providerErrors: [], checkedAt: "2026-08-12T12:00:00.000Z" }, detection, context), context);
assertCleanEmpty(empty);

for (const previous of ["Toryum", "Mars", "Atatürk"]) {
  const previousContext = intelligence.buildContext(previous, freshness.detectFreshness(previous));
  intelligence.enhanceResult({ query: previous, title: previous, articles: [{ title: previous, text: `${previous} hakkında bilgi.`, url: `https://example.org/${encodeURIComponent(previous)}`, source: "Fixture" }], images: [], structuredContent: { keyFacts: [], keyConcepts: [], sections: [], limitations: [] } }, previousContext);
  assertCleanEmpty(intelligence.enhanceResult(intelligence.createCurrentResult(query, { items: [], sources: [], providerErrors: [] }, detection, context), context));
}

const unrelated = intelligence.createCurrentResult(query, { items: [{ title: "Toryum", text: "Toryum radyoaktif bir elementtir.", url: "https://tr.wikipedia.org/wiki/Toryum", source: "Wikipedia", language: "tr" }], sources: ["Wikipedia"], providerErrors: [] }, detection, context);
assertCleanEmpty(intelligence.enhanceResult(unrelated, context));

const positive = intelligence.enhanceResult(intelligence.createCurrentResult(query, { items: [{ title: "Bugün teknoloji dünyasında yapay zekâ gelişmesi", text: "Teknoloji şirketleri bugün yeni bir yapay zekâ sistemi duyurdu.", url: "https://www.nasa.gov/technology-update", source: "NASA Breaking News", sourceId: "nasa-breaking", trust: "official", language: "tr", publishedAt: "2026-08-12T10:00:00.000Z" }], sources: ["NASA Breaking News"], providerErrors: [], checkedAt: "2026-08-12T12:00:00.000Z" }, detection, context), context);
assert.equal(positive.currentState, "CURRENT_VERIFIED");
assert.equal(positive.currentSourceCount, 1);
assert.equal(positive.freshness.sourceCount, 1);
assert.equal(positive.reliability.sourceCount, 1);
assert.equal(positive.articles.length, 1);
assert.ok(positive.structuredContent.keyFacts.length > 0);

console.log("PASS  current query identity, empty DTO, relevance gate, source-count consistency, sequential isolation, downstream guards, and positive current result");
