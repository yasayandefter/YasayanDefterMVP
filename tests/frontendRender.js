const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require("node:path").join(__dirname, "..", "assets", "js", "result-renderers.js"), "utf8");
const appSource = fs.readFileSync(require("node:path").join(__dirname, "..", "assets", "js", "app.js"), "utf8");
const styleSource = fs.readFileSync(require("node:path").join(__dirname, "..", "assets", "css", "style.css"), "utf8");
const htmlSource = fs.readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
const context = { window: { location: { href: "http://localhost/" } }, URL, Set, console };
vm.runInNewContext(source, context);
const renderers = context.window.ResultRenderers;

assert.equal(renderers.safeUrl("javascript:alert(1)"), "");
assert.equal(renderers.safeUrl("data:text/html,<script>x</script>"), "");
assert.equal(renderers.safeUrl("JAVASCRIPT:alert(1)"), "");
assert.equal(renderers.safeUrl("java%73cript:alert(1)"), "");
assert.equal(renderers.safeUrl("%6A%61vascript:alert(1)"), "");
assert.equal(renderers.safeUrl("vbscript:msgbox(1)"), "");
assert.equal(renderers.safeUrl("//example.org/path"), "");
assert.match(renderers.safeUrl("https://example.org/path?q=1"), /^https:\/\//);
assert.equal(renderers.confidenceLabel("unknown"), "Sınırlı kaynak desteği");

const full = renderers.buildResultViewModel({
  title: "Mars",
  query: "Mars",
  image: "javascript:bad()",
  structuredContent: {
    version: "1.0", audienceLevel: "general", summary: "Mars özeti.",
    sections: [{ title: "Genel", text: "Mars metni", points: ["Madde"] }],
    keyConcepts: [{ term: "Atmosfer", definition: "Gaz tabakası" }],
    keyFacts: [{ text: "Mars bir gezegendir.", confidence: "medium", sourceCount: 1 }],
    interestingFacts: ["Mars kırmızı görünür."],
    followUpQuestions: ["Mars neden kırmızı görünür?", "Mars neden kırmızı görünür?"],
    limitations: ["Tek kaynak.", "Tek kaynak."], generatedFrom: { usedFallback: false }
  },
  reliability: { score: 60, level: "medium" },
  articles: [{ title: "Güvenli kaynak", url: "javascript:bad()", text: "<script>bad()</script>" }]
});
assert.equal(full.safeImage, "");
assert.equal(full.questions.length, 1);
assert.equal(full.limitations.length, 1);
assert.equal(full.articles.length, 1);
assert.equal(full.reliability.level, "medium");
assert.equal(full.score, 60);
assert.equal(JSON.stringify(full).includes("[object Object]"), false);

const unsafeScores = renderers.buildResultViewModel({
  title: "Güvenli sonuç",
  text: "Özet",
  reliability: { score: Number.NaN, level: "untrusted" },
  structuredContent: {
    summary: "Özet",
    sections: [{ title: "Tekrar", text: "Özet" }, { title: "Uzun bölüm", text: "x".repeat(1200) }],
    followUpQuestions: ["Aynı soru?", "aynı soru?"],
    limitations: ["Uyarı", "Uyarı"],
    contentWarnings: ["Uyarı"]
  },
  sources: ["https://example.org/source"]
});
assert.equal(unsafeScores.score, null);
assert.equal(unsafeScores.confidenceLabel("untrusted"), "Sınırlı kaynak desteği");
assert.equal(unsafeScores.sections.length, 1);
assert.equal(unsafeScores.questions.length, 1);
assert.equal(unsafeScores.limitations.length, 1);
assert.equal(unsafeScores.articles.length, 0);
assert.deepEqual(unsafeScores.sources, ["https://example.org/source"]);

const legacy = renderers.buildResultViewModel({ title: "Eski sonuç", text: "Eski metin", articles: [], images: [] });
assert.equal(legacy.summary, "Eski metin");
assert.equal(legacy.sections.length, 0);
assert.equal(legacy.safeImage, "");

const legacyNull = renderers.buildResultViewModel({ ok: true, title: null, text: null, image: "data:text/html,bad", articles: null, images: [{ url: "vbscript:bad" }] });
assert.equal(legacyNull.title, "Araştırma sonucu");
assert.equal(legacyNull.summary, "");
assert.equal(legacyNull.safeImage, "");

assert.match(appSource, /initializeHorizontalRails\(\)/);
assert.match(appSource, /\.professional-concept-grid/);
assert.match(appSource, /\.professional-interesting-list/);
assert.match(appSource, /#imagesContainer/);
assert.match(appSource, /#flashcardsContainer/);
assert.match(appSource, /#relatedContainer/);
assert.match(appSource, /#sourcesContainer/);
assert.match(appSource, /const seen = new Set\(\);/);
assert.match(appSource, /toLocaleLowerCase\("tr-TR"\)/);
assert.match(appSource, /ArrowLeft.*ArrowRight.*Home.*End/s);
assert.match(appSource, /previous\.disabled = singleItem \|\| atStart/);
assert.match(appSource, /next\.disabled = singleItem \|\| atEnd/);
assert.match(appSource, /hint\.hidden = !scrollable/);
assert.match(styleSource, /overflow-x:auto/);
assert.match(styleSource, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(appSource, /setInterval\([^\n]*horizontal|setTimeout\([^\n]*rail/);
assert.match(htmlSource, /id="imagesContainer"/);
assert.match(htmlSource, /id="flashcardsContainer"/);
assert.match(htmlSource, /id="relatedContainer"/);

console.log("PASS  frontend result model, URL safety, fallbacks, allowlists, and deduplication");
