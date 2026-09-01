"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const { Pool } = require("pg");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  Browser auth E2E: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const suffix = crypto.randomBytes(5).toString("hex"); const username = `browser_auth_${suffix}`; const password = "Phase1-browser-auth-password!"; const port = 36000 + crypto.randomInt(1000); const base = `http://127.0.0.1:${port}`; const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
let child; let browser;
async function call(page, path, options) { return page.evaluate(async ({ path, options }) => { const response = await fetch(path, options); return { status: response.status, body: await response.json().catch(() => ({})) }; }, { path, options }); }
async function waitForServer() { for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${base}/api/status`)).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("SERVER_NOT_READY"); }
async function completeOnboarding(page) { const dialog = page.locator(".workspace-dialog[open]"); if (!await dialog.count()) return; await page.locator('label[for="onboarding-work"]').click(); await page.locator('label[for="onboarding-research"]').click(); await page.locator("#onboarding-primary").selectOption("work"); await page.locator(".workspace-dialog[open] .workspace-primary-action").click(); await page.locator(".workspace-dialog").waitFor({ state: "hidden" }); }

(async () => {
  assert.equal(require("node:fs").existsSync(EDGE), true); child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] }); await waitForServer(); browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const authenticatedContext = await browser.newContext({ viewport: { width: 1024, height: 768 } }); const authenticated = await authenticatedContext.newPage(); await authenticated.goto(base); await authenticated.locator("[data-open-register]").click(); await authenticated.getByLabel("Kullanıcı adı", { exact: true }).fill(username); await authenticated.getByLabel("Parola", { exact: true }).fill(password); await authenticated.getByLabel("Parola tekrar").fill(password); await authenticated.getByRole("button", { name: "Hesap oluştur" }).click(); await authenticated.locator("[data-auth-user]").waitFor(); await completeOnboarding(authenticated);
  const authorized = await call(authenticated, "/api/research?q=Mars", { headers: { Accept: "application/json" } }); assert.equal(authorized.status, 200); assert.equal(authorized.body.ok, true); assert.equal(authorized.body.query, "Mars"); const privateStatus = await call(authenticated, "/api/status"); assert.equal(privateStatus.status, 200); assert.equal(privateStatus.body.storageMode, "postgres"); await authenticatedContext.close();
  const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const publicPage = await publicContext.newPage(); await publicPage.goto(base); const unauthorized = await call(publicPage, "/api/research?q=Mars"); assert.equal(unauthorized.status, 401); assert.equal(unauthorized.body.ok, false); assert.equal(unauthorized.body.error.code, "UNAUTHENTICATED"); assert.equal((await call(publicPage, "/api/progress")).status, 401); await publicContext.close();
  console.log("PASS  real Edge registration, onboarding, authenticated research 200, unauthenticated research 401 UNAUTHENTICATED, protected route and local PostgreSQL auth contract");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); } await pool.query("DELETE FROM users WHERE username=$1", [username]).catch(() => {}); await pool.end(); });
