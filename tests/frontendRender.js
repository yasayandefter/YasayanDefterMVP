const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require("node:path").join(__dirname, "..", "assets", "js", "result-renderers.js"), "utf8");
const appSource = fs.readFileSync(require("node:path").join(__dirname, "..", "assets", "js", "app.js"), "utf8");
const professionalSource = fs.readFileSync(require("node:path").join(__dirname, "..", "assets", "js", "professional15.js"), "utf8");
const classroomSource = fs.readFileSync(require("node:path").join(__dirname, "..", "assets", "js", "classroom.js"), "utf8");
const styleSource = fs.readFileSync(require("node:path").join(__dirname, "..", "assets", "css", "style.css"), "utf8");
const htmlSource = fs.readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
const htmlIdPosition = id => htmlSource.indexOf(`id="${id}"`);
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
for (const id of ["quizQuestion", "quizOptions", "quizResult"]) assert.match(htmlSource, new RegExp(`id="${id}"`));
assert.equal((htmlSource.match(/<h1\b/gi) || []).length, 1);
assert.equal(new Set([...htmlSource.matchAll(/id="([^"]+)"/g)].map(match => match[1])).size, [...htmlSource.matchAll(/id="([^"]+)"/g)].length);
assert.ok(htmlIdPosition("brainEngineWorkspace") < htmlIdPosition("landingHow"));
assert.ok(htmlIdPosition("landingHow") < htmlIdPosition("landingWhy"));
assert.ok(htmlIdPosition("landingWhy") < htmlIdPosition("landingEngine"));
assert.ok(htmlIdPosition("landingEngine") < htmlIdPosition("landingLicense"));
assert.ok(htmlIdPosition("landingLicense") < htmlIdPosition("landingFooter"));
assert.match(htmlSource, /href="#brainEngineWorkspace"/);
assert.match(htmlSource, /href="#landingHow">Ürünü keşfet/);
assert.match(htmlSource, /href="#landingLicense"/);
assert.match(htmlSource, /mailto:yasayandefter1@gmail\.com/);
assert.doesNotMatch(htmlSource, /kamera|akıllı kamera|\b[Tt]ara\b|tararsın/);
for (const id of ["livingMemoryWorkspace", "memoryHistoryContainer", "memoryConnectionsContainer", "memoryReviewContainer", "memoryStatsContainer", "memoryTimelineContainer", "livingMemoryResultBanner"]) {
  assert.match(htmlSource, new RegExp(`id="${id}"`));
}
assert.match(appSource, /\/api\/memory\/history/);
assert.match(appSource, /\/api\/memory\/connections/);
assert.match(appSource, /\/api\/memory\/review/);
assert.match(appSource, /\/api\/memory\/stats/);
assert.match(appSource, /function renderLivingMemoryWorkspace/);
assert.match(appSource, /function renderLivingMemoryResult/);
assert.match(appSource, /function renderKnowledgeGraph/);
assert.match(professionalSource, /teacherDashboard/);
assert.match(professionalSource, /\/api\/teacher\/summary/);
assert.match(professionalSource, /Öğretmen Modu|Ã–ÄŸretmen Modu/);
assert.match(classroomSource, /classroomDashboard/);
assert.match(classroomSource, /Yeni sınıf adı|Yeni sÄ±nÄ±f adÄ±/);
assert.match(classroomSource, /Öğrenci ekle|Ã–ÄŸrenci ekle/);
assert.match(htmlSource, /assets\/js\/classroom\.js/);
assert.match(appSource, /function renderProQuiz/);
assert.match(appSource, /function completeProQuiz/);
assert.match(appSource, /\/api\/quiz\/start/);
assert.match(appSource, /\/api\/quiz\/answer/);
assert.match(appSource, /\/api\/quiz\/complete/);
assert.doesNotMatch(appSource, /function proQuizXp/);
assert.doesNotMatch(appSource, /awardXP/);
assert.match(appSource, /YanlÄ±ÅŸlarÄ± yeniden Ã§Ã¶z|Yanlışları yeniden çöz/);
assert.match(appSource, /quizProDifficulty/);
assert.match(appSource, /quizProCount/);
assert.match(appSource, /quizProType/);
assert.match(appSource, /attemptId/);
assert.match(appSource, /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg"/);
assert.match(appSource, /renderKnowledgeGraphLoading/);
assert.match(appSource, /renderKnowledgeGraphError/);
assert.match(appSource, /nodes\.length >= 23/);
assert.match(appSource, /edges\.size < 12/);
assert.match(appSource, /seen = new Set/);
assert.match(appSource, /typeof value === "string" \|\| typeof value === "number"/);
assert.match(appSource, /knowledgeGraphSignature/);
assert.match(appSource, /aria-hidden/,);
assert.match(styleSource, /@media \(hover:hover\) and \(pointer:fine\)/);
assert.match(appSource, /knowledge-map-svg/);
assert.doesNotMatch(appSource, /renderKnowledgeGraph[\s\S]{0,500}innerHTML/);
assert.match(appSource, /Promise\.allSettled/);
assert.match(appSource, /new AbortController\(\)/);
assert.match(appSource, /livingMemorySequence/);
assert.match(appSource, /Number\.isFinite/);
assert.match(appSource, /item\.createdAt \? new Date/);
assert.match(appSource, /\.living-memory-rail/);
assert.doesNotMatch(appSource, /livingMemory.*innerHTML\s*=/i);
assert.match(styleSource, /living-memory-workspace/);
assert.match(styleSource, /@media \(max-width:600px\).*living-memory-rail/);
assert.match(styleSource, /prefers-reduced-motion:reduce.*living-memory-skeleton/);

console.log("PASS  frontend result model, URL safety, fallbacks, allowlists, and deduplication");
