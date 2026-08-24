"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const { chromium } = require("playwright-core");
const { navigateTo } = require("./helpers/workspaceShellNavigation");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  password change Edge E2E: TEST_DATABASE_URL is not set"); process.exit(0); }
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
if (!fs.existsSync(EDGE)) { console.log("SKIP  password change Edge E2E: Edge is not installed"); process.exit(0); }

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const suffix = crypto.randomBytes(5).toString("hex");
const username = `edge_password_${suffix}`;
const oldPassword = "Edge-old-password!";
const newPassword = "Edge-new-password!";
let child; let browser;

async function wait(base) { for (let i = 0; i < 80; i += 1) { try { if ((await fetch(base + "/api/status")).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("SERVER_TIMEOUT"); }
async function focused(locator) { return locator.evaluate(node => node === document.activeElement); }
async function openLogin(page) { await page.locator("[data-open-login]").click(); await page.locator("[data-login-form]").waitFor(); }
async function submitLogin(page, rawPassword) { await page.getByLabel("Kullanıcı adı veya e-posta").fill(username); await page.getByLabel("Parola", { exact: true }).fill(rawPassword); await page.getByLabel("Parola", { exact: true }).press("Enter"); }

(async () => {
  const port = 37000 + crypto.randomInt(9000); const base = `http://localhost:${port}`;
  child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), AUTH_MODE: "production", ACCESS_MODE: "authenticated", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] });
  await wait(base); browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
  const consoleErrors = []; const pageErrors = []; const unexpected = []; let passwordRequests = 0;
  page.on("console", item => { if (item.type() === "error") consoleErrors.push(item.text()); });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => { if (request.url().endsWith("/api/auth/password")) passwordRequests += 1; });
  page.on("response", response => { if ([401, 403, 500].includes(response.status()) && !response.url().endsWith("/api/auth/password") && !response.url().endsWith("/api/auth/login")) unexpected.push(`${response.status()} ${response.url()}`); });

  await page.goto(base); assert.equal(await page.locator("#changePasswordButton").isHidden(), true, "public demo action hidden");
  await page.getByRole("button", { name: /Hesap oluştur/ }).click();
  await page.getByLabel("Kullanıcı adı", { exact: true }).fill(username);
  await page.getByLabel("Parola", { exact: true }).fill(oldPassword);
  await page.getByLabel("Parola tekrar").fill(oldPassword);
  await page.getByRole("button", { name: "Hesap oluştur" }).click();
  await page.locator(".workspace-dialog[open]").waitFor(); await page.getByRole("button", { name: "Şimdilik geç" }).click(); await page.locator(".workspace-dialog").waitFor({ state: "hidden" });
  await navigateTo(page, "profile");
  const opener = page.locator("#changePasswordButton"); await opener.waitFor({ state: "visible" }); await opener.focus(); await opener.click();
  const form = page.locator("[data-password-form]"); await form.waitFor();
  assert.equal(await page.locator('.auth-card[role="dialog"]').getAttribute("aria-modal"), "true");
  assert.equal(await focused(page.locator("#auth-passwordCurrent")), true, "initial focus");
  for (const id of ["passwordCurrent", "passwordNew", "passwordConfirm"]) assert.equal(await page.locator(`label[for="auth-${id}"]`).count(), 1);
  assert.equal(await page.getByLabel("Mevcut parola").getAttribute("autocomplete"), "current-password");
  assert.equal(await page.getByLabel("Yeni parola", { exact: true }).getAttribute("autocomplete"), "new-password");
  assert.equal(await page.getByLabel("Yeni parola tekrar").getAttribute("autocomplete"), "new-password");
  assert.equal(await page.locator(".auth-message").getAttribute("aria-live"), "polite");
  await page.keyboard.press("Shift+Tab"); const close = page.getByRole("button", { name: "Hesap penceresini kapat" }); assert.equal(await focused(close), true);
  await page.keyboard.press("Shift+Tab"); assert.equal(await focused(form.getByRole("button", { name: "Parolayı değiştir" })), true, "reverse trap");
  await page.keyboard.press("Tab"); assert.equal(await focused(close), true, "forward trap");
  await page.keyboard.press("Escape"); await page.locator(".auth-shell").waitFor({ state: "hidden" }); assert.equal(await focused(opener), true, "focus restore");

  await opener.click(); await page.getByLabel("Mevcut parola").fill("wrong-password"); await page.getByLabel("Yeni parola", { exact: true }).fill(newPassword); await page.getByLabel("Yeni parola tekrar").fill(newPassword); await page.getByLabel("Yeni parola tekrar").press("Enter");
  await page.locator(".auth-message.is-error").waitFor(); assert.match(await page.locator(".auth-message.is-error").textContent(), /Mevcut parola doğru değil/);
  assert.equal(consoleErrors.every(text => /Failed to load resource/.test(text)), true); consoleErrors.length = 0;
  await page.getByLabel("Mevcut parola").fill(oldPassword); await page.getByLabel("Yeni parola", { exact: true }).fill(newPassword); await page.getByLabel("Yeni parola tekrar").fill("Mismatch-password!");
  const beforeMismatch = passwordRequests; await page.getByLabel("Yeni parola tekrar").press("Enter"); await page.locator(".auth-message.is-error").waitFor(); assert.match(await page.locator(".auth-message.is-error").textContent(), /eşleşmiyor/); assert.equal(passwordRequests, beforeMismatch, "mismatch stays client-side");
  await page.getByLabel("Yeni parola tekrar").fill(newPassword); await page.getByLabel("Yeni parola tekrar").press("Enter");
  await page.locator(".auth-message.is-success").waitFor(); assert.match(await page.locator(".auth-message.is-success").textContent(), /başarıyla değiştirildi/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0);
  await page.locator(".auth-shell").waitFor({ state: "hidden" }); assert.equal((await page.evaluate(async () => await (await fetch("/api/auth/session")).json())).authenticated, true);
  await page.getByRole("button", { name: /Çıkış yap/ }).click(); await page.locator("[data-open-login]").waitFor(); await openLogin(page); await submitLogin(page, oldPassword);
  await page.locator(".auth-message.is-error").waitFor(); assert.match(await page.locator(".auth-message.is-error").textContent(), /geçersiz/);
  assert.equal(consoleErrors.every(text => /Failed to load resource/.test(text)), true); consoleErrors.length = 0;
  await page.getByLabel("Parola", { exact: true }).fill(newPassword); await page.getByLabel("Parola", { exact: true }).press("Enter"); await navigateTo(page, "profile"); await opener.waitFor({ state: "visible" });
  assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []); assert.deepEqual(unexpected, []);
  console.log("PASS  real Edge password change errors, success, session, old/new login, a11y, 390px, and clean runtime");
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (child && child.exitCode === null) child.kill("SIGTERM");
  try { const row = await pool.query("SELECT id FROM users WHERE username=$1", [username]); if (row.rows[0]) { await pool.query("DELETE FROM sessions WHERE user_id=$1", [row.rows[0].id]); await pool.query("DELETE FROM users WHERE id=$1", [row.rows[0].id]); } } finally { await pool.end(); }
});
