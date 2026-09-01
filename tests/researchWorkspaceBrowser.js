"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
let child; let browser; let authPool; let authUsername;
async function waitFor(base) { for (let i = 0; i < 180; i += 1) { try { if ((await fetch(base + "/api/status")).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("SERVER_NOT_READY"); }

(async () => {
  assert.equal(require("node:fs").existsSync(EDGE), true);
  const port = 36000 + crypto.randomInt(7000); const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), VERCEL: "1", NODE_ENV: "production", AUTH_MODE: "", STORAGE_MODE: "", DATABASE_URL: "", ACCESS_MODE: "" }, stdio: ["ignore", "ignore", "ignore"] });
  await waitFor(base); browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.route("https://fonts.googleapis.com/**", route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  const page = await context.newPage(); const errors = []; let researchRequests = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (new URL(response.url()).pathname === "/api/research") researchRequests += 1; });
  await page.goto(base);
  const publicResearch = await page.evaluate(async () => { const response = await fetch("/api/research?q=Mars"); return { status: response.status, body: await response.json() }; });
  assert.equal(publicResearch.status, 401); assert.equal(publicResearch.body.error.code, "UNAUTHENTICATED"); assert.equal(researchRequests, 1);
  await page.locator("[data-landing-login]").first().click(); await page.locator("[data-login-form]").waitFor(); await page.keyboard.press("Escape"); await page.locator(".auth-shell").waitFor({ state: "hidden" });
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0);
  }
  await page.setViewportSize({ width: 1366, height: 768 }); const ratio = await page.evaluate(() => document.documentElement.scrollHeight / innerHeight);
  assert.deepEqual(errors, []); await context.close();
  let authRatio = null;
  if (process.env.TEST_DATABASE_URL) {
    child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve));
    const authPort = 43000 + crypto.randomInt(1500); const authBase = `http://127.0.0.1:${authPort}`;
    child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(authPort), ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: authBase, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] });
    await waitFor(authBase); authUsername = `research_ui_${crypto.randomBytes(5).toString("hex")}`; authPool = new (require("pg").Pool)({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const authPassword = "Research-workspace-15.6!";
    await authPool.query("INSERT INTO users(id,role,username,display_name,password_hash,status) VALUES($1,'USER',$2,'Research UI',$3,'ACTIVE')", [crypto.randomUUID(), authUsername, require("../auth/password").hashPassword(authPassword)]);
    const authContext = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const authPage = await authContext.newPage(); const authErrors = []; const authResearchResponses = [];
    authPage.on("response", response => { if (new URL(response.url()).pathname === "/api/research") authResearchResponses.push({ method: response.request().method(), status: response.status() }); });
    authPage.on("pageerror", error => authErrors.push(error.message)); await authPage.goto(authBase); await authPage.locator("[data-landing-login]").first().click(); await authPage.getByLabel("Kullanıcı adı", { exact: true }).fill(authUsername); await authPage.getByLabel("Parola", { exact: true }).fill(authPassword); await authPage.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await authPage.locator(".workspace-dialog[open]").waitFor(); await authPage.getByRole("button", { name: "Şimdilik geç" }).click(); await authPage.locator(".workspace-dialog").waitFor({ state: "hidden" }); await authPage.locator('[data-shell-page="research"]').click();
    const visibleControls = await authPage.evaluate(() => {
      const visible = node => { const r = node.getBoundingClientRect(), s = getComputedStyle(node); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const hit = node => { const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return target === node || node.contains(target); };
      const inputs = Array.from(document.querySelectorAll("input")).filter(node => /araştır|konu|soru/i.test(`${node.id} ${node.placeholder} ${node.ariaLabel}`) && visible(node));
      const buttons = Array.from(document.querySelectorAll("button")).filter(node => node.id === "searchButton" && visible(node));
      return { inputCount: inputs.length, buttonCount: buttons.length, inputId: inputs[0]?.id, buttonId: buttons[0]?.id, inputHit: inputs[0] && hit(inputs[0]), buttonHit: buttons[0] && hit(buttons[0]) };
    });
    assert.deepEqual(visibleControls, { inputCount: 1, buttonCount: 1, inputId: "questionInput", buttonId: "searchButton", inputHit: true, buttonHit: true });
    await authPage.locator("#questionInput").click(); await authPage.locator("#questionInput").fill("Mustafa Kemal Atatürk"); await authPage.locator("#searchButton").click(); await authPage.locator("#researchWorkspace156").waitFor();
    await authPage.locator("#yd-research-panel-overview #topicTitle").waitFor();
    assert.equal(await authPage.locator("#yd-research-panel-overview #quizQuestion").isVisible(), true);
    assert.equal(await authPage.locator("#yd-research-panel-overview #progressPercent").isVisible(), true);
    await authPage.locator("#topicImageBox img").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    const visibleResult = await authPage.evaluate(() => Object.fromEntries(["topicTitle", "heroSummary", "imagesContainer"].map(id => { const node = document.getElementById(id), rect = node?.getBoundingClientRect(); return [id, { text: node?.textContent?.trim() || "", width: rect?.width || 0, top: rect?.top ?? innerHeight, bottom: rect?.bottom ?? innerHeight }]; })));
    assert.equal(visibleResult.topicTitle.text, "Mustafa Kemal Atatürk");
    for (const value of Object.values(visibleResult)) assert.ok(value.text.length > 0 && value.width > 0 && value.top >= 0 && value.top < 768 && value.bottom > 0, JSON.stringify(visibleResult));
    assert.deepEqual(authResearchResponses, [{ method: "GET", status: 200 }]);
    const commercialLayout = await authPage.evaluate(() => {
      const box = selector => { const node = document.querySelector(selector), rect = node?.getBoundingClientRect(); return { width: rect?.width || 0, height: rect?.height || 0, top: rect?.top ?? innerHeight, bottom: rect?.bottom ?? innerHeight, visible: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0) }; };
      const overview = document.getElementById("yd-research-panel-overview");
      return { command: box(".hero-search"), hero: box("#topicTitle"), summary: box("#heroSummary"), image: box("#topicImageBox img"), metadata: box(".hero-info"), toolbar: box(".yd-research-tabs"), visuals: box("#imagesContainer"), quiz: box("#quizQuestion"), progress: box("#progressPercent"), continuation: box("#followContainer"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, bodyRatio: document.documentElement.scrollHeight / innerHeight, overviewScroll: (overview?.scrollHeight || 0) - (overview?.clientHeight || 0), overviewOverflow: getComputedStyle(overview).overflowY };
    });
    assert.ok(commercialLayout.command.height <= 70, JSON.stringify(commercialLayout));
    for (const key of ["hero", "summary", "metadata", "toolbar", "visuals", "quiz", "progress"]) assert.equal(commercialLayout[key].visible, true, `${key}: ${JSON.stringify(commercialLayout)}`);
    if (commercialLayout.image.width > 0) assert.equal(commercialLayout.image.visible, true, JSON.stringify(commercialLayout));
    assert.ok(commercialLayout.overflow <= 0 && commercialLayout.bodyRatio <= 1.05 && commercialLayout.overviewOverflow === "clip", JSON.stringify(commercialLayout));
    const visualScreenshot = path.join(os.tmpdir(), "yd-research-ataturk-final.png");
    await authPage.screenshot({ path: visualScreenshot });
    if (await authPage.locator('[data-research-tab="visuals"]').isVisible()) {
      await authPage.locator("#yd-research-panel-overview #imagesContainer").waitFor();
      await authPage.locator('[data-research-tab="visuals"]').click();
      assert.equal(await authPage.locator("#yd-research-panel-visuals #imagesContainer").isVisible(), true);
    }
    await authPage.locator('[data-research-tab="quiz"]').click(); assert.equal(await authPage.locator("#yd-research-panel-quiz #quizQuestion").isVisible(), true);
    await authPage.locator("#questionInput").click(); await authPage.locator("#questionInput").fill("Yapay zekâ"); await authPage.locator("#searchButton").click();
    await authPage.waitForFunction(() => document.getElementById("topicTitle")?.textContent?.trim() === "Yapay zekâ");
    assert.equal(await authPage.locator('[data-research-tab="overview"]').getAttribute("aria-selected"), "true");
    assert.deepEqual(authResearchResponses, [{ method: "GET", status: 200 }, { method: "GET", status: 200 }]);
    await authPage.locator('[data-research-tab="quiz"]').click();
    const requestsBeforeSecondQuery = await authPage.evaluate(() => performance.getEntriesByType("resource").filter(entry => new URL(entry.name).pathname === "/api/research").length);
    await authPage.locator("#questionInput").click(); await authPage.locator("#questionInput").fill("Mars");
    await authPage.locator("#questionInput").press("Enter");
    await authPage.waitForFunction(() => document.getElementById("topicTitle")?.textContent?.trim() === "Mars");
    assert.equal(await authPage.locator('[data-research-tab="overview"]').getAttribute("aria-selected"), "true");
    const requestsAfterSecondQuery = await authPage.evaluate(() => performance.getEntriesByType("resource").filter(entry => new URL(entry.name).pathname === "/api/research").length);
    assert.equal(requestsAfterSecondQuery, requestsBeforeSecondQuery + 1);
    assert.deepEqual(authResearchResponses, [{ method: "GET", status: 200 }, { method: "GET", status: 200 }, { method: "GET", status: 200 }]);
    await authPage.locator('[data-research-tab="sources"]').click(); assert.equal(await authPage.locator("#yd-research-panel-sources").isVisible(), true); await authPage.locator('[data-research-tab="overview"]').click();
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }]) {
      await authPage.setViewportSize(viewport);
      const layout = await authPage.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, ratio: document.documentElement.scrollHeight / innerHeight, topic: document.querySelector("#topicTitle")?.getBoundingClientRect(), quiz: document.querySelector("#quizQuestion")?.getBoundingClientRect(), progress: document.querySelector("#progressPercent")?.getBoundingClientRect() }));
      assert.ok(layout.overflow <= 0, `${viewport.width}: ${JSON.stringify(layout)}`);
      assert.ok(layout.topic?.width > 0 && layout.quiz?.width > 0 && layout.progress?.width > 0, `${viewport.width}: ${JSON.stringify(layout)}`);
      if (viewport.width === 1024 || viewport.width === 1366) assert.ok(layout.ratio <= 1.05, `${viewport.width}: ${JSON.stringify(layout)}`);
    }
    await authPage.setViewportSize({ width: 1366, height: 768 });
    authRatio = await authPage.evaluate(() => document.documentElement.scrollHeight / innerHeight); assert.ok(authRatio <= 1.05, `AUTH_BODY_RATIO_${authRatio}`); assert.equal(await authPage.locator("[data-research-save]").isVisible(), true); assert.deepEqual(authErrors, []); await authContext.close();
  }
  console.log(`PASS  real Edge 15.8 Yapay zekâ overview cross-section, dedicated visuals/quiz/sources and 360/390/768/1024/1366 bounded layouts; public ratio=${ratio.toFixed(3)}${authRatio === null ? "" : `; auth body ratio=${authRatio.toFixed(3)}`}`);
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); } if (authPool) { if (authUsername) await authPool.query("DELETE FROM users WHERE username=$1", [authUsername]).catch(() => {}); await authPool.end(); } });
