"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const root = path.join(__dirname, "..");
const port = 35000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${port}`;
const persistenceFiles = ["memory.json", "yasayan_deefter_memory.json"].map(file => path.join(root, file));
const digest = file => fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
const before = new Map(persistenceFiles.map(file => [file, digest(file)]));
let child; let browser;
async function ready() { for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`${base}/api/status`)).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("PUBLIC_TEST_SERVER_NOT_READY"); }
(async () => {
  assert.ok(fs.existsSync(EDGE), "Microsoft Edge bulunamadı");
  child = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, PORT: String(port), VERCEL: "1", NODE_ENV: "production", AUTH_MODE: "", STORAGE_MODE: "", DATABASE_URL: "", ACCESS_MODE: "" }, stdio: ["ignore", "pipe", "pipe"] });
  await ready(); browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  const consoleErrors = []; const pageErrors = []; const failed = []; const apiResponses = []; const directWikimediaApiRequests = [];
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", r => failed.push(r.url()));
  page.on("request", r => { if (/^https:\/\/commons\.wikimedia\.org\/w\/api\.php/i.test(r.url())) directWikimediaApiRequests.push(r.url()); });
  page.on("response", r => { if (r.url().startsWith(`${base}/api/`)) apiResponses.push({ url: r.url(), status: r.status(), method: r.request().method() }); });
  await page.goto(base, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#brainEngineWorkspace").isVisible(), true); assert.equal(await page.locator(".auth-shell").isVisible(), false);
  assert.equal(await page.getByRole("button", { name: "Giriş Yap", exact: true }).isVisible(), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.locator("#questionInput").fill("Mars gezegeni");
  const standardStartedAt = Date.now(); const standardResponse = page.waitForResponse(r => r.url().includes("/api/research") && r.status() === 200); await page.locator("#searchButton").click(); const standardPayload = await (await standardResponse).json(); const standardDurationMs = Date.now() - standardStartedAt;
  assert.equal(standardPayload.mode, "standard"); assert.equal(standardPayload.intent, "SPACE");
  await page.locator("#results.visible").waitFor(); assert.ok((await page.locator("#summaryText").textContent()).trim().length > 0);
  assert.ok(await page.locator("#imagesContainer .image-card, #imagesContainer .fact").count() > 0, "gallery should render images or a graceful fallback");
  const currentStartedAt = Date.now();
  await page.locator("#questionInput").fill("2026 güncel uzay araştırmaları"); const currentResponse = page.waitForResponse(r => r.url().includes("/api/research") && r.status() === 200); await page.locator("#searchButton").click(); assert.equal((await currentResponse).status(), 200); await page.locator("#results.visible").waitFor();
  const currentPayload = await (await currentResponse).json(); const currentDurationMs = Date.now() - currentStartedAt; assert.equal(currentPayload.mode, "current");
  await page.locator("#questionInput").fill("Tesla"); const ambiguousResponse = page.waitForResponse(r => r.url().includes("/api/research") && r.status() === 200); await page.locator("#searchButton").click(); const ambiguousPayload = await (await ambiguousResponse).json(); assert.equal(ambiguousPayload.disambiguation.ambiguous, true); await page.locator("#results.visible").waitFor();
  await page.locator("#questionInput").fill("Mars ile Dünya arasındaki farklar"); const comparisonResponse = page.waitForResponse(r => r.url().includes("/api/research") && r.status() === 200); await page.locator("#searchButton").click(); const comparisonPayload = await (await comparisonResponse).json(); assert.equal(comparisonPayload.intent, "COMPARISON"); assert.equal(comparisonPayload.comparison.entities.length, 2); await page.locator("#results.visible").waitFor();
  const currentTechnologyQuery = "Bugün teknoloji dünyasında neler oldu?";
  for (const previousTopic of ["Toryum", "Mars", "Atatürk"]) {
    await page.locator("#questionInput").fill(previousTopic); const previousResponse = page.waitForResponse(r => r.url().includes("/api/research") && r.status() === 200); await page.locator("#searchButton").click(); assert.equal((await previousResponse).status(), 200); await page.locator("#results.visible").waitFor();
    await page.locator("#questionInput").fill(currentTechnologyQuery); const isolationResponse = page.waitForResponse(r => r.url().includes("/api/research") && r.status() === 200); await page.locator("#searchButton").click(); const isolationPayload = await (await isolationResponse).json(); await page.locator("#results.visible").waitFor();
    assert.equal(isolationPayload.mode, "current"); assert.equal(isolationPayload.query, currentTechnologyQuery); assert.equal(isolationPayload.title, currentTechnologyQuery); assert.equal(isolationPayload.brain.category, "Teknoloji");
    assert.equal(JSON.stringify(isolationPayload).toLocaleLowerCase("tr-TR").includes(previousTopic.toLocaleLowerCase("tr-TR")), false, `${previousTopic} backend contamination`);
    assert.equal((await page.locator("#results").innerText()).toLocaleLowerCase("tr-TR").includes(previousTopic.toLocaleLowerCase("tr-TR")), false, `${previousTopic} DOM contamination`);
    if (isolationPayload.currentSourceCount === 0) { assert.equal(isolationPayload.currentState, "CURRENT_EMPTY"); assert.equal(isolationPayload.articles.length, 0); assert.equal(isolationPayload.reliability.sourceCount, 0); assert.equal(isolationPayload.freshness.sourceCount, 0); }
    if (previousTopic === "Toryum") {
      assert.equal(isolationPayload.currentState, "CURRENT_EMPTY");
      const emptyText = await page.locator("#professionalResult").innerText();
      assert.equal(emptyText.includes("[object Object]"), false);
      for (const question of ["Teknoloji haberlerini hangi kaynaklardan takip edebilirim?", "Yapay zekâ alanındaki son gelişmeleri araştır.", "Bugünkü uzay teknolojisi gelişmelerini araştır."]) assert.equal(emptyText.includes(question), true, question);
      assert.equal(await page.locator("#professionalResult[data-current-empty='true']").count(), 1);
      assert.equal(await page.locator("#results > .section:not(#professionalResult):visible").count(), 0);
      assert.equal(await page.locator(".current-empty-retry:visible").count(), 1);
      const retryResponse = page.waitForResponse(r => r.url().includes("/api/research") && r.status() === 200); await page.locator(".current-empty-retry").click(); const retryPayload = await (await retryResponse).json(); await page.locator("#professionalResult[data-current-empty='true']").waitFor(); assert.equal(retryPayload.query, currentTechnologyQuery); assert.equal(await page.locator("#questionInput").inputValue(), currentTechnologyQuery);
    }
  }
  const verifiedFixture = { query: "Doğrulanmış teknoloji gelişmesi", title: "Doğrulanmış teknoloji gelişmesi", mode: "current", researchMode: "current", currentState: "CURRENT_VERIFIED", currentSourceCount: 1, freshness: { checkedAt: "2026-08-12T12:00:00.000Z", sourceCount: 1 }, brain: { category: "Teknoloji", facts: [{ text: "Doğrulanmış güncel teknoloji bilgisi." }], flashcards: [{ front: "Soru", back: "Yanıt" }] }, ai: { lesson: { simple: "Basit doğrulanmış anlatım", detailed: "Detaylı doğrulanmış anlatım", analogy: "Doğrulanmış benzetme", examples: ["Doğrulanmış örnek"] } }, articles: [{ title: "Doğrulanmış kaynak", text: "Doğrulanmış güncel teknoloji bilgisi.", url: "https://example.org/verified", source: "Fixture" }], sources: ["Fixture"], reliability: { score: 80, level: "high", sourceCount: 1, independentDomainCount: 1, highQualitySourceCount: 1 }, structuredContent: { summary: "Doğrulanmış güncel özet.", sections: [{ title: "Son durum", text: "Doğrulanmış güncel teknoloji bilgisi." }], keyFacts: [{ text: "Doğrulanmış güncel teknoloji bilgisi.", confidence: "high", sourceCount: 1 }], keyConcepts: [], interestingFacts: [], followUpQuestions: ["Devam araştırması yap"], limitations: [] } };
  await page.evaluate(data => renderResearch(data), verifiedFixture);
  assert.equal(await page.locator("#professionalResult[data-current-empty='true']").count(), 0); assert.ok(await page.locator("#professionalResult .professional-fact-card:visible").count() > 0); assert.ok(await page.locator("#professionalResult .professional-source-card:visible").count() > 0); assert.ok(await page.locator("#results > .section:not(#professionalResult):visible").count() > 0);
  await page.locator("#questionInput").fill("Toryum nedir?"); const standardRegressionResponse = page.waitForResponse(r => r.url().includes("/api/research") && r.status() === 200); await page.locator("#searchButton").click(); const standardRegressionPayload = await (await standardRegressionResponse).json(); await page.locator("#results.visible").waitFor(); assert.equal(standardRegressionPayload.mode, "standard"); assert.equal(await page.locator("#teacherSimple").isVisible(), true); assert.equal(await page.locator("#flashcardsContainer").isVisible(), true); assert.equal(await page.locator("#quizQuestion").isVisible(), true);
  assert.deepEqual(apiResponses.filter(x => /\/api\/(analyze|memory|progress|recommendations|classrooms|teacher)/.test(x.url)), []);
  assert.deepEqual(apiResponses.filter(x => x.status === 401 || x.status === 403 || x.status >= 500), []); assert.deepEqual(directWikimediaApiRequests, []); assert.deepEqual(failed, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []);
  assert.deepEqual(Object.fromEntries(persistenceFiles.map(file => [file, digest(file)])), Object.fromEntries(before));
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).click(); assert.equal(await page.locator(".auth-shell").isVisible(), true); assert.equal(await page.locator("[data-login-form]").isVisible(), true);
  console.log(`PASS  public-first Edge E2E; standardMs=${standardDurationMs}; currentMs=${currentDurationMs}; current-empty/follow-up/verified/standard UX; contamination=0; objectObject=0; API=${apiResponses.length}; wikimediaApiFetches=0; unexpected401403500=0; consoleErrors=0; pageErrors=0`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (child && child.exitCode === null) child.kill("SIGTERM"); });
