const assert = require("node:assert/strict");
const content = require("../brain/contentStructurer");

const articles = [
  {
    title: "Mars hakkında genel bilgiler",
    text: "Mars, Güneş Sistemi'nin dördüncü gezegenidir. Kırmızı görünümü demir oksit içeren yüzeyinden kaynaklanır. Mars'ın atmosferi çoğunlukla karbondioksitten oluşur.",
    url: "https://tr.wikipedia.org/wiki/Mars",
    source: "Wikipedia"
  },
  {
    title: "Mars araştırması",
    text: "Mars, Güneş Sistemi'nin dördüncü gezegenidir. Bilim insanları Mars atmosferini ve yüzey koşullarını araştırır.",
    url: "https://science.example.edu/mars",
    source: "University"
  }
];

const structured = content.buildStructuredContent({ topic: "Mars", articles }, { audienceLevel: "general" });
assert.equal(structured.version, "1.0");
assert.equal(structured.audienceLevel, "general");
assert.ok(structured.summary.length > 0);
assert.ok(structured.sections.length > 0);
assert.ok(structured.keyConcepts.length > 0);
assert.ok(structured.keyFacts.length > 0);
assert.ok(structured.followUpQuestions.length > 0);
assert.equal(structured.generatedFrom.usedFallback, false);
assert.doesNotThrow(() => JSON.stringify(structured));

const fallback = content.buildStructuredContent({ topic: "Mars", articles: [], usedFallback: true }, { audienceLevel: "general" });
assert.equal(fallback.generatedFrom.usedFallback, true);
assert.ok(fallback.limitations.length > 0);

const html = content.buildStructuredContent({ topic: "DNA", articles: [{ title: "DNA", text: "<script>alert(1)</script><style>x{}</style> DNA, canlıların genetik bilgisini taşır. DNA yapısı kalıtsal bilgiyi içerir.", url: "https://example.org/dna" }] }, { audienceLevel: "child" });
assert.equal(JSON.stringify(html).includes("alert(1)"), false);
assert.equal(JSON.stringify(html).includes("<script"), false);
const safeHtml = content.buildStructuredContent({ topic: "DNA", articles: [{ title: "DNA", text: "<div onclick=\"evil()\">DNA değildir yalnızca bir kod değildir.</div><svg><script>evil()</script></svg> DNA yaklaşık 3 milyar baz çifti içerir.", url: "https://example.org/dna" }] });
assert.equal(JSON.stringify(safeHtml).includes("evil"), false);
assert.ok(JSON.stringify(safeHtml).includes("değildir"));
assert.ok(JSON.stringify(safeHtml).includes("yaklaşık"));

const repeated = content.buildStructuredContent({ topic: "Mars", articles: [{ title: "Mars", text: "Mars kırmızı görünür. Mars kırmızı görünür. Mars kırmızı görünür." }] });
assert.ok(repeated.summary.split("Mars kırmızı görünür.").length <= 2);

const large = content.buildStructuredContent({ topic: "Test", articles: [{ title: "Test", text: "Test konusu açıklanır. ".repeat(5000) }] });
assert.ok(JSON.stringify(large).length < 50000);
const empty = content.buildStructuredContent({ topic: "Uzak konu", articles: [] });
assert.equal(empty.followUpQuestions.length, 0);
assert.ok(empty.limitations.length > 0);
const conceptQuality = content.extractKeyConcepts([{ title: "Teknoloji gelişmeleri", text: "Yapay zekâ olarak adını duyuran sistem geliştiriliyor. Teknoloji alanında yeni işlemciler ve kuantum bilgisayar araştırmaları sürüyor." }]);
const lowValueConcepts = new Set(["ediliyor", "olduğu", "adını", "olan", "olarak", "ve", "ile"]);
assert.equal(conceptQuality.some(item => lowValueConcepts.has(String(item.term || item).toLocaleLowerCase("tr-TR"))), false);
for (const input of [null, "plain", [], { broken: true }]) assert.doesNotThrow(() => content.buildStructuredContent(input));
assert.deepEqual(structured, content.buildStructuredContent({ topic: "Mars", articles }, { audienceLevel: "general" }));
const child = content.buildStructuredContent({ topic: "Mars", articles }, { audienceLevel: "child" });
assert.equal(child.audienceLevel, "child");
assert.ok(child.summary.length <= structured.summary.length || structured.summary.length < 100);
assert.equal(JSON.stringify(structured).includes("[object Object]"), false);
assert.equal(JSON.stringify(structured).includes("undefined"), false);

console.log("PASS  structured content extraction, safety, limitations, audience, determinism, and bounds");
