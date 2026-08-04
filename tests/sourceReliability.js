const assert = require("node:assert/strict");
const reliability = require("../brain/sourceReliability");

const official = {
  title: "Ulusal Sağlık Kurumu insülin direnci rehberi",
  url: "https://www.saglik.gov.tr/rehber?utm_source=test",
  snippet: "İnsülin direnci hakkında kapsamlı, doğrulanabilir ve güncel açıklamalar.",
  source: "Resmi kurum",
  publishedAt: new Date().toISOString()
};
const academic = {
  title: "Insulin resistance research",
  url: "https://medicine.example.edu/research/insulin-resistance",
  snippet: "Academic research and scientific evidence about insulin resistance and metabolism.",
  publisher: "University research center"
};
const wikipedia = {
  title: "Insulin resistance",
  url: "https://en.wikipedia.org/wiki/Insulin_resistance?oldid=1",
  snippet: "Insulin resistance is a biological condition with a detailed encyclopedia overview.",
  source: "Wikipedia (EN)"
};
const weak = { title: "Buy products", url: "https://shop.example.com/item?utm_campaign=x", snippet: "Short." };

assert.equal(reliability.classifySource(official), "government");
assert.equal(reliability.classifySource(academic), "education");
assert.equal(reliability.classifySource(wikipedia), "encyclopedia");
assert.equal(reliability.normalizeSource(wikipedia).canonicalUrl, "https://en.wikipedia.org/wiki/Insulin_resistance?oldid=1");
assert.notEqual(
  reliability.normalizeSource(wikipedia).canonicalUrl,
  reliability.normalizeSource({ ...wikipedia, url: "https://en.wikipedia.org/wiki/Insulin_resistance?oldid=2" }).canonicalUrl
);
assert.ok(reliability.scoreSource(official, { query: "insülin direnci", sources: [official, academic] }).reliabilityScore >= 60);
assert.ok(reliability.scoreSource(weak, { query: "insülin direnci", sources: [weak] }).reliabilityScore < 60);

const duplicateWikipedia = { ...wikipedia, url: "http://en.wikipedia.org/wiki/Insulin_resistance?oldid=1&utm_medium=x" };
const scored = reliability.rankSources([official, academic, wikipedia, weak, duplicateWikipedia], { query: "insülin direnci" });
assert.equal(scored.length, 4);
assert.ok(scored.every(item => item.reliabilityScore >= 0 && item.reliabilityScore <= 100));
assert.deepEqual(scored, reliability.rankSources([official, academic, wikipedia, weak, duplicateWikipedia], { query: "insülin direnci" }));
const summary = reliability.summarizeReliability(scored);
assert.equal(summary.sourceCount, 4);
assert.ok(summary.independentDomainCount >= 3);
assert.ok(reliability.scoreSource({ title: "missing fields" }, { query: "test" }).reliabilityScore >= 0);
const oneSource = reliability.scoreSource(official, { query: "insülin direnci", sources: [official] });
assert.ok(oneSource.score < 90);
assert.equal(reliability.summarizeReliability([
  reliability.normalizeSource(wikipedia),
  reliability.normalizeSource({ ...wikipedia, url: "https://commons.wikimedia.org/wiki/File:Insulin.jpg" })
]).independentDomainCount, 1);
assert.equal(reliability.normalizeSource({ title: "large", snippet: "x".repeat(10000) }).snippet.length, 2000);
for (const value of [null, "plain source", [], { broken: true }]) {
  assert.doesNotThrow(() => reliability.scoreSource(value, { query: "test" }));
}
assert.doesNotThrow(() => JSON.stringify({ scored, summary }));

console.log("PASS  source normalization, classification, scoring, deduplication, ranking, and determinism");
