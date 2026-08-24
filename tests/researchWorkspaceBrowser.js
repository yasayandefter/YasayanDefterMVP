"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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
  await page.goto(base); await page.locator("#questionInput").fill("Mars"); await page.locator("#searchButton").click();
  await page.locator("#researchWorkspace156").waitFor(); await page.locator("#results.visible").waitFor();
  const tabs = page.locator("[data-research-tab]:visible"); assert.ok(await tabs.count() >= 5);
  assert.equal(await page.locator('[data-research-tab="overview"]').getAttribute("aria-selected"), "true");
  for (const id of ["visuals", "sources", "quiz", "memory"]) {
    await page.locator(`[data-research-tab="${id}"]`).click();
    assert.equal(await page.locator(`[data-research-panel="${id}"]`).count(), 0);
    assert.equal(await page.locator(`#yd-research-panel-${id}`).isVisible(), true);
  }
  await page.locator('[data-research-tab="overview"]').focus(); await page.keyboard.press("End");
  assert.equal(await page.locator("[data-research-tab][aria-selected=true]").evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Home"); assert.equal(await page.locator('[data-research-tab="overview"]').getAttribute("aria-selected"), "true");
  const before = researchRequests; await page.locator('[data-research-tab="sources"]').click(); await page.locator('[data-research-tab="overview"]').click(); assert.equal(researchRequests, before);
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0);
  }
  await page.setViewportSize({ width: 1366, height: 768 }); const ratio = await page.locator("#researchWorkspace156").evaluate(node => node.getBoundingClientRect().height / innerHeight); assert.ok(ratio <= 1.15, `WORKSPACE_RATIO_${ratio}`);
  assert.deepEqual(errors, []); await context.close();
  let authRatio = null;
  if (process.env.TEST_DATABASE_URL) {
    child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve));
    const authPort = 43000 + crypto.randomInt(1500); const authBase = `http://127.0.0.1:${authPort}`;
    child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(authPort), ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: authBase, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] });
    await waitFor(authBase); authUsername = `research_ui_${crypto.randomBytes(5).toString("hex")}`; authPool = new (require("pg").Pool)({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const authContext = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const authPage = await authContext.newPage(); const authErrors = [];
    authPage.on("pageerror", error => authErrors.push(error.message)); await authPage.goto(authBase); await authPage.locator("[data-open-register]").click(); await authPage.getByLabel("Kullanıcı adı", { exact: true }).fill(authUsername); await authPage.getByLabel("Parola", { exact: true }).fill("Research-workspace-15.6!"); await authPage.getByLabel("Parola tekrar").fill("Research-workspace-15.6!"); await authPage.getByRole("button", { name: "Hesap oluştur" }).click();
    await authPage.locator(".workspace-dialog[open]").waitFor(); await authPage.getByRole("button", { name: "Şimdilik geç" }).click(); await authPage.locator(".workspace-dialog").waitFor({ state: "hidden" }); await authPage.locator('[data-shell-page="research"]').click();
    await authPage.locator("#questionInput").fill("DNA"); await authPage.locator("#searchButton").click(); await authPage.locator("#researchWorkspace156").waitFor(); await authPage.locator('[data-research-tab="sources"]').click(); assert.equal(await authPage.locator("#yd-research-panel-sources").isVisible(), true); await authPage.locator('[data-research-tab="overview"]').click();
    authRatio = await authPage.evaluate(() => document.documentElement.scrollHeight / innerHeight); assert.ok(authRatio <= 1.15, `AUTH_BODY_RATIO_${authRatio}`); assert.equal(await authPage.locator("[data-research-save]").isVisible(), true); assert.deepEqual(authErrors, []); await authContext.close();
  }
  console.log(`PASS  real Edge 15.6 public/authenticated research tabs, keyboard, local switching, responsive matrix; workspace ratio=${ratio.toFixed(3)}${authRatio === null ? "" : `; auth body ratio=${authRatio.toFixed(3)}`}`);
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); } if (authPool) { if (authUsername) await authPool.query("DELETE FROM users WHERE username=$1", [authUsername]).catch(() => {}); await authPool.end(); } });
