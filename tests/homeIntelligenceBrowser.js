"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const { chromium } = require("playwright-core");
const { bindRoute, navigateTo, reloadTo } = require("./helpers/workspaceShellNavigation");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  home intelligence Edge E2E: TEST_DATABASE_URL missing"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error("TEST_DATABASE_URL_ONLY");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
if (!fs.existsSync(EDGE)) { console.log("SKIP  home intelligence Edge E2E: Edge missing"); process.exit(0); }

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const name = `home_edge_${crypto.randomBytes(5).toString("hex")}`;
const password = "Home-edge!";
let child; let browser;

async function wait(base) {
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(base + "/api/status")).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error("TIMEOUT");
}

(async () => {
  const port = 49600 + crypto.randomInt(300); const base = `http://localhost:${port}`;
  child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] });
  await wait(base); browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } }); const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base); await page.locator("[data-open-register]").click();
  await page.locator("#auth-username").fill(name); await page.locator("#auth-newPassword").fill(password); await page.locator("#auth-confirmPassword").fill(password); await page.locator("[data-register-form] button[type=submit]").click();
  await page.locator(".workspace-dialog[open]").waitFor(); await page.locator('label[for="onboarding-work"]').click(); await page.locator('label[for="onboarding-research"]').click(); await page.locator("#onboarding-primary").selectOption("work"); await page.locator(".workspace-dialog[open] .workspace-primary-action").click(); await page.locator(".workspace-dialog").waitFor({ state: "hidden" });
  await bindRoute(page, "home");
  await page.evaluate(async () => {
    const records = [];
    for (const [title, type, metadata] of [["Samsung toplantı", "meeting", {}], ["Samsung araştırma", "research", {}], ["Samsung aktif proje", "project", { status: "active" }], ["Samsung fikir", "idea", {}]]) {
      const result = await (await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content: title, workspaceArea: "work", contentType: type, tags: ["samsung", "partner"], metadata }) })).json(); records.push(result.memory.id);
    }
    await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Samsung Çalışmaları", workspaceArea: "work", recordIds: records.slice(0, 3) }) });
    await window.YDHomeIntelligence.load();
  });
  await page.locator("#homeIntelligence").waitFor(); await page.locator(".home-context-item").filter({ hasText: "Samsung" }).first().waitFor();
  assert.ok(await page.locator(".home-context-item").count() <= 3); assert.equal((await page.locator(".home-adaptive-actions button").allTextContents())[0], "Toplantı Notu");
  await navigateTo(page, "collections"); await page.evaluate(() => window.YDSmartCollections.load()); await page.locator(".collection-card").filter({ hasText: "Samsung Çalışmaları" }).waitFor();
  await navigateTo(page, "home"); await page.locator(".home-context-dismiss").first().evaluate(node => node.click()); assert.equal(await page.locator("#homeIntelligenceLive").textContent(), "Öneri bu oturum için kapatıldı.");
  for (const width of [360, 390, 768, 1024, 1366]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, "overflow " + width); }
  await reloadTo(page, "home"); await page.evaluate(() => window.YDHomeIntelligence.load()); await page.locator("#homeIntelligence .home-context-item").first().waitFor();
  await page.getByRole("button", { name: /Çıkış yap/ }).click(); await page.locator("[data-open-login]").waitFor(); await page.waitForFunction(() => !document.querySelector("#homeIntelligence"));
  assert.deepEqual(errors, []);
  console.log("PASS  real Edge compact home intelligence, max-three continue, collection route, dismiss, refresh, public isolation and responsive matrix");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  await pool.query("DELETE FROM users WHERE username=$1", [name]).catch(() => {}); await pool.end();
});
