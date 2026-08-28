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
  await page.locator("[data-open-register]").click();
  await page.locator("#auth-username").fill(username);
  await page.locator("#auth-newPassword").fill(password);
  await page.locator("#auth-confirmPassword").fill(password);
  await page.locator("[data-register-form] button[type=submit]").click();
  await page.locator(".workspace-dialog[open]").waitFor();
  await page.locator('label[for="onboarding-work"]').click();
  await page.locator('label[for="onboarding-research"]').click();
  await page.locator("#onboarding-primary").selectOption("work");
  await page.locator(".workspace-dialog[open] .workspace-primary-action").click();
  await page.locator(".workspace-dialog").waitFor({ state: "hidden" });
  await page.locator("#yd-panel-home").waitFor();

  assert.equal(await page.locator(".yd-action-card").count(), 5);
  const desktop = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const canvas = rect(".yd-shell-viewport");
    const search = rect(".yd-home-search");
    const cards = [...document.querySelectorAll(".yd-action-card")].map(node => node.getBoundingClientRect());
    const rail = rect(".yd-metrics-rail");
    const metrics = [...document.querySelectorAll(".yd-metric")].map(node => node.getBoundingClientRect());
    const aligned = [".yd-home-intro", ".yd-metrics-rail", ".yd-action-grid", ".yd-suggestions", ".workspace-home", ".yd-home-empty"].map(selector => rect(selector));
    const empty = document.querySelector(".yd-home-empty");
    return { canvasWidth: canvas.width, searchWidth: search.width, searchHeight: search.height, cardMinHeight: Math.min(...cards.map(card => card.height)), railHeight: rail.height, metricTopSpread: Math.max(...metrics.map(item => item.top)) - Math.min(...metrics.map(item => item.top)), alignmentSpread: Math.max(...aligned.map(item => item.width)) - Math.min(...aligned.map(item => item.width)), emptyHeight: empty && getComputedStyle(empty).display !== "none" ? empty.getBoundingClientRect().height : 0, emptyText: empty?.textContent || "", ratio: document.documentElement.scrollHeight / innerHeight };
  });
  assert.ok(desktop.canvasWidth >= 1180 && desktop.canvasWidth <= 1240, JSON.stringify(desktop));
  assert.ok(desktop.searchWidth >= 760 && desktop.searchHeight >= 50 && desktop.searchHeight <= 58, JSON.stringify(desktop));
  assert.ok(desktop.cardMinHeight >= 138, JSON.stringify(desktop));
  assert.ok(desktop.metricTopSpread <= 2, JSON.stringify(desktop));
  assert.ok(desktop.railHeight <= 72, JSON.stringify(desktop));
  assert.ok(desktop.alignmentSpread <= 2, JSON.stringify(desktop));
  assert.ok(desktop.emptyHeight === 0 || desktop.emptyHeight <= 90, JSON.stringify(desktop));
  assert.match(desktop.emptyText, /Henüz devam eden bir çalışma yok\./);
  assert.ok(desktop.ratio <= 1.05, JSON.stringify(desktop));

  for (const width of [360, 390, 768, 1024, 1366]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 768 });
    const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, cards: document.querySelectorAll(".yd-action-card").length, searchButtonHeight: document.querySelector(".yd-home-search button").getBoundingClientRect().height, metricsVisible: [...document.querySelectorAll(".yd-metric")].every(node => node.getBoundingClientRect().width > 0) }));
    assert.ok(state.overflow <= 0, `${width}: ${JSON.stringify(state)}`);
    assert.equal(state.cards, 5);
    assert.ok(state.searchButtonHeight >= 42, `${width}: ${JSON.stringify(state)}`);
    assert.equal(state.metricsVisible, true);
  }
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(serverErrors, []);
  console.log(`PASS  real Edge Home refinement 360/390/768/1024/1366; desktop ratio=${desktop.ratio.toFixed(3)}, canvas=${desktop.canvasWidth}, search=${desktop.searchWidth}`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  await pool.query("DELETE FROM users WHERE username=$1", [username]).catch(() => {});
  await pool.end();
});
