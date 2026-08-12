"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const root = path.join(__dirname, ".."); const port = 37000 + Math.floor(Math.random() * 1000); const base = `http://127.0.0.1:${port}`;
let child; let browser;
async function ready() { for (let index = 0; index < 100; index += 1) { try { if ((await fetch(`${base}/api/status`)).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("LIVE_EDGE_SERVER_NOT_READY"); }
(async () => {
  assert.ok(fs.existsSync(EDGE), "Microsoft Edge bulunamadı");
  child = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, PORT: String(port), VERCEL: "1", NODE_ENV: "production", AUTH_MODE: "", STORAGE_MODE: "", DATABASE_URL: "", ACCESS_MODE: "" }, stdio: ["ignore", "pipe", "pipe"] });
  await ready(); browser = await chromium.launch({ executablePath: EDGE, headless: true }); const page = await browser.newPage();
  const consoleErrors = []; const pageErrors = []; const badResponses = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); }); page.on("pageerror", error => pageErrors.push(error.message)); page.on("response", response => { if (response.url().startsWith(`${base}/api/`) && [401, 403].includes(response.status()) || response.status() >= 500) badResponses.push({ url: response.url(), status: response.status() }); });
  await page.goto(base, { waitUntil: "networkidle" });
  const queries = ["Bugün teknoloji dünyasında neler oldu?", "Yapay zekâ alanındaki son gelişmeler", "Bugünkü bilim haberleri", "Bugünkü uzay gelişmeleri", "Bugünkü siber güvenlik gelişmeleri", "Son deprem nerede oldu?"];
  const results = [];
  for (const query of queries) {
    await page.locator("#questionInput").fill(query); const startedAt = Date.now(); const pending = page.waitForResponse(response => response.url().includes("/api/research") && response.status() === 200, { timeout: 30000 }); await page.locator("#searchButton").click(); const payload = await (await pending).json(); await page.locator("#results.visible").waitFor();
    assert.equal(payload.currentState, "CURRENT_VERIFIED", query); assert.ok(payload.currentSourceCount > 0, query); assert.ok(Array.isArray(payload.claims) && payload.claims.length > 0, query); assert.ok(payload.claims.every(claim => claim.eventId && claim.sourceRefs.length && claim.sourceCount === claim.sourceRefs.length), query); if (payload.brain?.quiz) { assert.equal(payload.brain.quiz.verified, true); assert.ok(payload.brain.quiz.claimRef); assert.ok(payload.brain.quiz.sourceRefs.length); }
    assert.equal(await page.locator("#professionalResult[data-current-empty='true']").count(), 0); assert.ok(await page.locator("#professionalResult .professional-source-card:visible").count() > 0); assert.ok(await page.locator("#professionalResult .professional-fact-card:visible").count() > 0); assert.equal(await page.getByText("Doğrulanmış Bilgiler", { exact: true }).count(), 1);
    const domText = await page.locator("#results").innerText(); const payloadText = JSON.stringify(payload); for (const banned of ["<p>", "<table", "&nbsp;", "href=", "View CSAF", "Bilgiye daha hızlı ulaşmayı sağlar", "günlük hayatta kullandığın bir araç gibi düşün", "Bu konu tamamen hayal ürünüdür"]) { assert.equal(domText.includes(banned), false, `${query}: ${banned}`); assert.equal(payloadText.includes(banned), false, `${query} payload: ${banned}`); }
    results.push({ query, sourceCount: payload.currentSourceCount, domains: new Set(payload.articles.map(item => item.domain).filter(Boolean)).size, claims: payload.claims.length, crossSourceClaims: payload.claims.filter(claim => claim.independentDomains >= 2).length, verifiedQuiz: Boolean(payload.brain?.quiz?.verified), durationMs: Date.now() - startedAt });
  }
  assert.ok(results[0].domains >= 2); assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []); assert.deepEqual(badResponses, []);
  console.log(`PASS  real Edge live current claims/quiz E2E; queries=6; technologyDomains=${results[0].domains}; claims=${results.map(item => item.claims).join(",")}; crossSourceClaims=${results.map(item => item.crossSourceClaims).join(",")}; verifiedQuiz=${results.map(item => item.verifiedQuiz).join(",")}; htmlLeaks=0; genericFillers=0; consoleErrors=0; pageErrors=0; unexpected401403500=0; durations=${results.map(item => item.durationMs).join(",")}`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (child && child.exitCode === null) child.kill("SIGTERM"); });
