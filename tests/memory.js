const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const memory = require("../brain/livingMemory");

(async () => {

const now = new Date("2026-01-10T00:00:00.000Z");
const result = {
  query: "Mars",
  title: "Mars",
  text: "Mars bir gezegendir.",
  image: "",
  url: "https://tr.wikipedia.org/wiki/Mars",
  articles: [{ title: "Mars", text: "Mars bir gezegendir." }],
  sources: ["Wikipedia"],
  related: ["Jüpiter"],
  confidence: 82,
  reliability: { score: 82, level: "high", sourceCount: 1, independentDomainCount: 1, highQualitySourceCount: 1 },
  analysis: { topic: "Mars", keywords: ["gezegen"], relatedTopics: ["Jüpiter"] },
  brain: { summary: "Mars özeti", facts: ["Mars kızıl gezegendir."] },
  structuredContent: { audienceLevel: "general", keyConcepts: ["Gezegenler"], keyFacts: ["Mars Güneş Sistemi'ndedir."] }
};

const first = memory.buildEntry(result, null, now);
assert.ok(first.id);
for (const field of ["id", "topic", "createdAt", "updatedAt", "keyConcepts", "keyFacts", "relatedTopics", "reliabilitySummary", "confidence", "sourceCount", "audienceLevel"]) {
  assert.ok(Object.prototype.hasOwnProperty.call(first, field), `missing ${field}`);
}

const updated = memory.buildEntry(result, first, new Date("2026-01-11T00:00:00.000Z"));
assert.equal(updated.id, first.id);
assert.equal(updated.timesSearched, 2);
assert.equal(memory.sanitizeRecords([first, updated, null, {}, { topic: "" }]).length, 1);
const safeShape = memory.buildEntry({ ...result, related: [{ title: "Jüpiter", text: "" }] }, null, now);
assert.equal(safeShape.related[0].title, "Jüpiter");
assert.doesNotMatch(JSON.stringify(safeShape), /\[object Object\]/);

const jupiter = memory.buildEntry({ ...result, query: "Jüpiter", title: "Jüpiter", analysis: { topic: "Jüpiter", keywords: ["gezegen"] }, related: ["Mars"] }, null, now);
const records = [first, jupiter, { broken: true }];
const connections = memory.buildConnections(records);
assert.ok(connections.some(item => new Set([item.from, item.to]).has("Mars") && new Set([item.from, item.to]).has("Jüpiter")));
assert.equal(new Set(connections.map(item => item.id)).size, connections.length);

const history = memory.buildHistory(records);
assert.equal(history.length, 2);
assert.equal(history[0].sequence, 1);
assert.equal(history[1].previousTopic, history[0].topic);

const review = memory.buildReview(records, now);
assert.deepEqual([...new Set(review.map(item => item.intervalDays))], [1, 3, 7, 30]);
assert.equal(review.length, 8);

const stats = memory.buildStats(records, connections, now);
assert.equal(stats.totalTopics, 2);
assert.equal(stats.mostStudiedTopic, "Jüpiter");
assert.equal(stats.connectionCount, connections.length);

assert.ok(memory.buildSuggestions(updated, records).some(item => item.type === "remembered"));

const variants = ["Mars", "mars", "MARS", "  Mars?  ", "M\u0061rs"];
assert.equal(new Set(variants.map(memory.stableId)).size, 1);
assert.equal(memory.sanitizeRecords(variants.map(topic => ({ topic }))).length, 1);
assert.equal(memory.sanitizeRecords([{ topic: "İklim değişikliği" }, { topic: "İKLİM DEĞİŞİKLİĞİ" }]).length, 1);
assert.notEqual(memory.stableId("Atatürk"), memory.stableId("Kuantum fiziği"));

const legacy = memory.sanitizeRecord({ topic: "Eski konu", facts: [{ text: "eski bilgi" }], images: ["image"], sources: ["source"], quiz: { question: "q" } });
assert.equal(legacy.images[0], "image");
assert.equal(legacy.sources[0], "source");
assert.deepEqual(legacy.quiz, { question: "q" });
assert.equal(legacy.createdAt, "1970-01-01T00:00:00.000Z");

const sameTime = memory.buildHistory([
  { topic: "Zulu", createdAt: now.toISOString() },
  { topic: "Alpha", createdAt: now.toISOString() }
]);
assert.deepEqual(sameTime.map(item => item.topic), ["Alpha", "Zulu"]);
assert.equal(memory.buildReview([{ topic: "Mars", updatedAt: now.toISOString() }], new Date("2026-01-11T00:00:00.000Z")).find(item => item.intervalDays === 1).due, true);
assert.equal(memory.buildReview([{ topic: "Mars", updatedAt: now.toISOString() }], new Date("2026-01-10T23:59:59.999Z")).find(item => item.intervalDays === 1).due, false);
assert.equal(memory.buildReview([{ topic: "Mars", updatedAt: "invalid" }], now).every(item => !Number.isNaN(Date.parse(item.scheduledAt))), true);
assert.equal(memory.buildStats([{ topic: "NaN", confidence: NaN }, { topic: "Infinity", confidence: Infinity }]).averageConfidence, 0);

const tempFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "living-memory-")), "memory.json");
assert.equal(memory.writeJSONAtomic(tempFile, [{ topic: "safe" }]), true);
assert.deepEqual(JSON.parse(fs.readFileSync(tempFile, "utf8"))[0].topic, "safe");
const beforeFailedWrite = fs.readFileSync(tempFile, "utf8");
assert.equal(memory.writeJSONAtomic(path.join(path.dirname(tempFile), "missing", "memory.json"), [{ topic: "bad" }]), false);
assert.equal(fs.readFileSync(tempFile, "utf8"), beforeFailedWrite);
await Promise.all(Array.from({ length: 10 }, (_, index) => Promise.resolve().then(() => memory.writeJSONAtomic(tempFile, [{ topic: `parallel-${index}` }]))));
assert.doesNotThrow(() => JSON.parse(fs.readFileSync(tempFile, "utf8")));
fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });

const parallelRecords = await Promise.all(Array.from({ length: 10 }, (_, index) => Promise.resolve(memory.buildEntry({ ...result, query: `Konu ${index}`, title: `Konu ${index}`, analysis: { topic: `Konu ${index}` } }, null, now))));
assert.equal(memory.sanitizeRecords(parallelRecords).length, 10);

const connectionsCheck = memory.buildConnections([
  { topic: "Mars", relatedTopics: ["Jüpiter"] },
  { topic: "Jüpiter", relatedTopics: ["Mars"] },
  { topic: "Kişisel yemek tarifi", keyConcepts: ["bilgi", "sistem"] }
]);
assert.equal(connectionsCheck.some(item => item.from === item.to), false);
assert.equal(connectionsCheck.filter(item => new Set([item.from, item.to]).has("Mars") && new Set([item.from, item.to]).has("Jüpiter")).length, 1);
assert.equal(connectionsCheck.some(item => item.from === "Kişisel yemek tarifi" || item.to === "Kişisel yemek tarifi"), false);
console.log("PASS  living memory records, deduplication, connections, review schedule, stats, and malformed data tolerance");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
