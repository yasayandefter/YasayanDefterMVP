"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const { Pool } = require("pg");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  workspace Edge E2E: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
if (!fs.existsSync(EDGE)) { console.log("SKIP  workspace Edge E2E: Edge is not installed"); process.exit(0); }

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
const username = `workspace_edge_${crypto.randomBytes(5).toString("hex")}`;
const password = "Workspace-edge-password!";
let child; let browser;

async function waitFor(base) {
  for (let i = 0; i < 80; i += 1) { try { if ((await fetch(base + "/api/status")).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("SERVER_NOT_READY");
}

(async () => {
  const port = 40000 + crypto.randomInt(5000); const base = `http://localhost:${port}`;
  child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] });
  await waitFor(base); browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } }); const consoleErrors = []; const pageErrors = []; const unexpected = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("response", response => { if ([401, 403, 500].includes(response.status())) unexpected.push(`${response.status()} ${response.url()}`); });
  await page.goto(base); await page.locator("[data-open-register]").click();
  await page.getByLabel("Kullanıcı adı", { exact: true }).fill(username); await page.getByLabel("Parola", { exact: true }).fill(password); await page.getByLabel("Parola tekrar").fill(password);
  await page.getByRole("button", { name: "Hesap oluştur" }).click(); await page.locator(".workspace-dialog[open]").waitFor();
  assert.equal(await page.locator("#onboarding-learning").isChecked(), false); await page.locator('label[for="onboarding-learning"]').click(); await page.locator('label[for="onboarding-creative"]').click();
  await page.locator("#onboarding-primary").selectOption("creative"); const saved = page.waitForResponse(response => response.url().endsWith("/api/auth/workspace") && response.request().method() === "PUT" && response.status() === 200);
  await page.getByRole("button", { name: "Defterimi Oluştur" }).click(); await saved; await page.locator(".workspace-dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator("html").getAttribute("data-workspace-primary"), "creative"); assert.match(await page.locator("#questionInput").getAttribute("placeholder"), /fikri/i);
  for (const width of [360, 390, 768, 1024, 1366]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, `overflow ${width}`); assert.equal(await page.locator("#workspaceHome").isVisible(), true); }
  await page.reload(); await page.locator("[data-auth-user]").waitFor(); await page.waitForFunction(() => document.documentElement.dataset.workspacePrimary === "creative"); assert.equal(await page.locator("#settings-creative").isChecked(), true);
  const checkbox = page.locator("#settings-work"); await checkbox.focus(); await page.keyboard.press("Space"); assert.equal(await checkbox.isChecked(), true); assert.equal(await page.locator(".workspace-status").last().getAttribute("aria-live"), "polite");
  assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []); assert.deepEqual(unexpected, []);
  console.log("PASS  authenticated real Edge workspace onboarding, persistence, keyboard accessibility, adaptive UI and 360/390/768/1024/1366 responsive matrix");
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  await pool.query("DELETE FROM users WHERE username=$1", [username]).catch(() => {}); await pool.end();
});
