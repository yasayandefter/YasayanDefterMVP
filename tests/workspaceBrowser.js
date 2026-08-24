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
const studentId = crypto.randomUUID();
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
  const noteSanity = await page.evaluate(async () => { const created = await (await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "15.6 Edge sanity", content: "Minimal test kaydı", workspaceArea: "work", contentType: "note", tags: ["15.6"], metadata: {} }) })).json(); const listed = await (await fetch("/api/memory/list?archive=active&limit=20")).json(); return { created: Boolean(created.memory?.id), listed: listed.memories?.some(item => item.id === created.memory?.id) }; }); assert.deepEqual(noteSanity, { created: true, listed: true });
  await page.locator("#workspaceShell156").waitFor(); assert.equal(await page.locator(".yd-action-card").count(), 5); assert.equal(await page.locator(".yd-shell-nav-item").count(), 6); await page.getByText("Bugün ne yapmak istersin?").waitFor();
  const viewportResults = {};
  for (const [width, height] of [[360, 800], [390, 844], [768, 900], [1024, 768], [1366, 768]]) { await page.setViewportSize({ width, height }); await page.locator('.yd-shell-nav-item[data-shell-page="home"]').click(); const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, ratio: document.documentElement.scrollHeight / innerHeight, body: [...document.body.children].filter(x => getComputedStyle(x).display !== "none").map(x => ({ tag: x.tagName, id: x.id, cls: x.className, top: x.getBoundingClientRect().top, height: x.getBoundingClientRect().height })).filter(x => x.height) })); viewportResults[width] = metrics; assert.ok(metrics.overflow <= 0, `overflow ${width}`); assert.equal(await page.locator("#workspaceHome").isVisible(), true); }
  assert.ok(viewportResults[1366].ratio <= 1.15, `1366 ${JSON.stringify(viewportResults[1366])}`); assert.ok(viewportResults[1024].ratio <= 1.5, `1024 ratio ${viewportResults[1024].ratio}`);
  for (const route of ["research", "notebook", "collections", "personal", "profile", "home"]) { const tab = page.locator(`.yd-shell-nav-item[data-shell-page="${route}"]`); await tab.click(); assert.equal(await tab.getAttribute("aria-selected"), "true"); assert.equal(await page.locator(`[data-shell-panel="${route}"]`).isVisible(), true); }
  await page.locator('.yd-shell-nav-item[data-shell-page="home"]').focus(); await page.keyboard.press("End"); assert.equal(await page.locator('.yd-shell-nav-item[data-shell-page="profile"]').getAttribute("aria-selected"), "true"); await page.keyboard.press("Home"); assert.equal(await page.locator('.yd-shell-nav-item[data-shell-page="home"]').getAttribute("aria-selected"), "true");
  await page.reload(); await page.locator("[data-auth-user]").waitFor(); await page.waitForFunction(() => document.documentElement.dataset.workspacePrimary === "creative"); assert.equal(await page.locator("#settings-creative").isChecked(), true);
  await page.locator('.yd-shell-nav-item[data-shell-page="profile"]').click(); const checkbox = page.locator("#settings-work"); await checkbox.focus(); await page.keyboard.press("Space"); assert.equal(await checkbox.isChecked(), true); assert.equal(await page.locator(".workspace-status").last().getAttribute("aria-live"), "polite");
  assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []); assert.deepEqual(unexpected, []);
  await pool.query("UPDATE users SET role='TEACHER' WHERE username=$1", [username]); await page.reload(); await page.locator("[data-shell-teacher]").waitFor();
  await pool.query("INSERT INTO students (id, user_id, display_name) SELECT $1, id, $2 FROM users WHERE username=$3", [studentId, "15.6 Edge Student", username]); await pool.query("UPDATE users SET role='STUDENT' WHERE username=$1", [username]); await page.reload(); await page.locator("#workspaceShell156").waitFor(); assert.equal(await page.locator("[data-shell-teacher]").count(), 0);
  console.log("PASS  authenticated real Edge 15.6 shell, onboarding, persistence, smart-note sanity, USER/TEACHER/STUDENT navigation, six routes, five cards, keyboard and responsive matrix " + JSON.stringify(viewportResults));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  await pool.query("DELETE FROM students WHERE id=$1", [studentId]).catch(() => {}); await pool.query("DELETE FROM users WHERE username=$1", [username]).catch(() => {}); await pool.end();
});
