"use strict";

const assert = require("node:assert/strict");
const freshness = require("../brain/freshness");
const intelligence = require("../brain/researchIntelligence");
const providers = require("../brain/currentProviders");
const quiz = require("../brain/quizEngine");

const query = "Son gelişmeler yapay zekâ";
const detection = freshness.detectFreshness(query, new Date("2026-09-24T12:00:00Z"));
const context = intelligence.buildContext(query, detection);
const items = [
  { title: "New AI research update", summary: "This source describes a new method for the field.", text: "This source describes a new method for the field.", url: "https://example.com/ai", domain: "example.com", source: "Example", sourceName: "Example", publishedAt: "2026-09-23T12:00:00Z", language: "en", authority: 90, currentRelevanceVerified: true },
  { title: "Artificial intelligence system announced", summary: "Researchers announced a new artificial intelligence system.", text: "Researchers announced a new artificial intelligence system.", url: "https://example.org/ai", domain: "example.org", source: "Example Org", sourceName: "Example Org", publishedAt: "2026-09-22T12:00:00Z", language: "en", authority: 90, currentRelevanceVerified: true }
];
const current = intelligence.createCurrentResult(query, { items, events: providers.clusterEvents(items), sources: items.map(item => item.source), providerErrors: [], checkedAt: "2026-09-24T12:00:00Z" }, detection, context);
assert.equal(current.language, "tr");
assert.doesNotMatch(current.summary, /This source describes|Researchers announced/i);
assert.match(current.summary, /2 güncel gelişme, 2 kaynak yazısı ve 2 bağımsız kaynaktan/);
assert.equal(current.structuredContent.generatedFrom.sourceCount, current.currentSourceCount);
assert.equal(current.structuredContent.sections[0].sources[0].title, items[0].title);

const research = { query: "Mars", structuredContent: { keyFacts: [
  { text: "Mars, Güneş Sistemi'nin Güneş'ten itibaren dördüncü gezegenidir.", concept: "Mars", confidence: "high" },
  { text: "Mars'ın iki doğal uydusu Phobos ve Deimos'tur.", concept: "Uydular", confidence: "high" },
  { text: "Mars atmosferi çoğunlukla karbondioksitten oluşur.", concept: "Atmosfer", confidence: "high" },
  { text: "Mars yüzeyindeki demir oksit kızıl görünüm oluşturur.", concept: "Yüzey", confidence: "high" }
] } };
const generated = quiz.buildQuiz(research, { count: 5, type: "multiple-choice" });
assert.ok(generated.questions.length >= 2);
for (const question of generated.questions) {
  assert.doesNotMatch(question.prompt, /boşluğunu tamamlayın|_____/i);
  assert.doesNotMatch(JSON.stringify(question.options), /Kaynaklara göre şu ifade yanlıştır|doğru değildir|araştırmada belirtilmemiştir|\bdeğildir\b|\bbulunmamaktadır\b|\byoktur\b/i);
  assert.ok(question.options.every(option => option.trim().split(/\s+/).length >= 3 || /^\d+(?:[.,]\d+)?(?:\s+\S+)?$/.test(option.trim())));
  assert.equal(new Set(question.options.map(option => option.toLocaleLowerCase("tr-TR"))).size, question.options.length);
  assert.equal(question.options.filter(option => option === question.correctAnswer).length, 1);
  assert.ok(question.sourceFact && question.sourceFact.length >= 24);
}

console.log("PASS  final quality patch language/count and natural quiz regressions");
