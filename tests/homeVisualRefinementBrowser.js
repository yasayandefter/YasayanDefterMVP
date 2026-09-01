"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const { chromium } = require("playwright-core");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  Home visual refinement Edge: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error("TEST_DATABASE_URL_ONLY");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (!fs.existsSync(EDGE)) { console.log("SKIP  Home visual refinement Edge: Edge missing"); process.exit(0); }

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const username = `home_refine_${crypto.randomBytes(5).toString("hex")}`;
const password = "Home-refinement!";
let child;
let browser;

async function wait(base) {
  for (let index = 0; index < 100; index += 1) {
    try { if ((await fetch(base + "/api/status")).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("TIMEOUT");
}

(async () => {
  const port = 48980 + crypto.randomInt(80);
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] });
  await wait(base);
  browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const consoleErrors = [];
  const pageErrors = [];
  const serverErrors = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("response", response => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
  await page.goto(base);
  assert.equal(await page.locator("#landingPage").isVisible(), true);
  assert.equal(await page.locator("#workspaceShell156").count(), 0);
  assert.equal(await page.evaluate(() => window.YasayanDefterAuth?.authenticated), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  const headerCta = page.locator(".landing-header-cta[data-landing-login]");
  assert.equal(await headerCta.getAttribute("href"), "#login");
  assert.equal(await headerCta.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === node || node.contains(hit);
  }), true);
  await headerCta.click();
  await page.locator("[data-login-form]").waitFor();
  await page.locator(".auth-close").click();
  await headerCta.focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-login-form]").waitFor();
  await page.locator(".auth-close").click();
  assert.equal(await page.locator(".landing-quick-card").count(), 4);
  await page.locator('.landing-quick-card[href="#landingHow"]').click();
  assert.equal(new URL(page.url()).hash, "#landingHow");
  await page.goto(base);
  await page.locator("[data-open-register]").click();
  await page.locator("#auth-username").fill(username);
  await page.locator("#auth-newPassword").fill(password);
  await page.locator("#auth-confirmPassword").fill(password);
  await page.locator("[data-register-form] button[type=submit]").click();
  await page.locator(".workspace-dialog[open], #yd-panel-home").first().waitFor();
  await page.locator(".workspace-dialog[open]").waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await page.locator(".workspace-dialog[open]").isVisible()) {
    await page.locator('label[for="onboarding-work"]').click();
    await page.locator('label[for="onboarding-research"]').click();
    await page.locator("#onboarding-primary").selectOption("work");
    await page.locator(".workspace-dialog[open] .workspace-primary-action").click();
    await page.locator(".workspace-dialog").waitFor({ state: "hidden" });
  }
  await page.locator("#yd-panel-home").waitFor();
  assert.equal(await page.evaluate(() => window.YasayanDefterAuth?.authenticated), true);
  assert.equal(await page.locator("#landingPage").isVisible(), false);

  assert.equal(await page.locator(".yd-action-card").count(), 5);
  const desktop = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const canvas = rect(".yd-shell-viewport");
    const search = rect(".yd-home-search");
    const cards = [...document.querySelectorAll(".yd-action-card")].map(node => node.getBoundingClientRect());
    const rail = rect(".yd-metrics-rail");
    const metrics = [...document.querySelectorAll(".yd-metric")].map(node => node.getBoundingClientRect());
    const empty = document.querySelector(".yd-home-empty");
    return { canvasWidth: canvas.width, searchWidth: search.width, searchHeight: search.height, cardMinHeight: Math.min(...cards.map(card => card.height)), railHeight: rail.height, commandTop: rect(".yd-home-intro").top, metricsTop: rail.top, commandHeight: rect(".yd-home-intro").height, metricsWidth: rail.width, continuityWidth: rect(".yd-home-continuity").width, actionsWidth: rect(".yd-home-actions").width, emptyHeight: empty && getComputedStyle(empty).display !== "none" ? empty.getBoundingClientRect().height : 0, emptyText: empty?.textContent || "", ratio: document.documentElement.scrollHeight / innerHeight };
  });
  assert.ok(desktop.canvasWidth >= 1200 && desktop.canvasWidth <= 1240, JSON.stringify(desktop));
  assert.ok(desktop.searchWidth >= 700 && desktop.searchHeight >= 50 && desktop.searchHeight <= 58, JSON.stringify(desktop));
  assert.ok(desktop.cardMinHeight >= 108, JSON.stringify(desktop));
  assert.ok(Math.abs(desktop.commandTop - desktop.metricsTop) <= 2, JSON.stringify(desktop));
  assert.ok(Math.abs(desktop.commandHeight - desktop.railHeight) <= 2, JSON.stringify(desktop));
  assert.ok(Math.abs(desktop.continuityWidth - desktop.actionsWidth) <= 2, JSON.stringify(desktop));
  assert.ok(desktop.emptyHeight === 0 || desktop.emptyHeight <= 90, JSON.stringify(desktop));
  assert.match(desktop.emptyText, /Henüz devam eden bir çalışma yok\./);
  assert.ok(desktop.ratio <= 1.05, JSON.stringify(desktop));

  for (const width of [360, 390, 768, 1024, 1366]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 768 });
    const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, cards: document.querySelectorAll(".yd-action-card").length, searchButtonHeight: document.querySelector(".yd-home-search button").getBoundingClientRect().height, metricsVisible: [...document.querySelectorAll(".yd-metric")].every(node => node.getBoundingClientRect().width > 0), ratio: document.documentElement.scrollHeight / innerHeight }));
    assert.ok(state.overflow <= 0, `${width}: ${JSON.stringify(state)}`);
    assert.equal(state.cards, 5);
    assert.ok(state.searchButtonHeight >= 42, `${width}: ${JSON.stringify(state)}`);
    assert.equal(state.metricsVisible, true);
    if (width === 1024 || width === 1366) assert.ok(state.ratio <= 1.05, `${width}: ${JSON.stringify(state)}`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator(".yd-home-search input").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.equal(await page.locator('.yd-action-card[data-action-page="notebook"]').evaluate(node => node.matches(":focus-visible")), true);
  await page.locator('.yd-action-card[data-action-page="notebook"]').click();
  assert.equal(await page.locator('.yd-shell-nav-item[data-shell-page="notebook"]').getAttribute("aria-selected"), "true");
  await page.locator('.yd-shell-nav-item[data-shell-page="home"]').click();
  assert.equal(await page.locator('.yd-shell-nav-item[data-shell-page="home"]').getAttribute("aria-selected"), "true");
  await page.locator("#searchButton").evaluate(node => { node.disabled = true; });
  await page.locator(".yd-home-search input").fill("Öğrenme bilimi");
  await page.locator(".yd-home-search").evaluate(node => node.requestSubmit());
  assert.equal(await page.locator("#questionInput").inputValue(), "Öğrenme bilimi");
  assert.equal(await page.locator('.yd-shell-nav-item[data-shell-page="research"]').getAttribute("aria-selected"), "true");
  await page.locator("#searchButton").evaluate(node => { node.disabled = false; });
  await page.locator('.yd-shell-nav-item[data-shell-page="home"]').click();
  const reducedMotion = await page.emulateMedia({ reducedMotion: "reduce" }).then(() => page.locator(".yd-action-card").first().evaluate(node => getComputedStyle(node).transitionDuration));
  assert.ok(Number.parseFloat(reducedMotion) <= 0.00001, reducedMotion);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(serverErrors, []);
  console.log(`PASS  real Edge 15.8 Home 360/390/768/1024/1366, bounded desktop, research handoff, keyboard focus, navigation and reduced motion; ratio=${desktop.ratio.toFixed(3)}`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  await pool.query("DELETE FROM users WHERE username=$1", [username]).catch(() => {});
  await pool.end();
});
