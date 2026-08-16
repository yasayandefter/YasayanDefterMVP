"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const { Pool } = require("pg");
const { chromium } = require("playwright-core");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  password reset Edge E2E: TEST_DATABASE_URL is not set"); process.exit(0); }
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"; if (!fs.existsSync(EDGE)) { console.log("SKIP  password reset Edge E2E: Edge is not installed"); process.exit(0); }
process.env.NODE_ENV = "test"; process.env.AUTH_MODE = "production"; process.env.ACCESS_MODE = "authenticated"; process.env.STORAGE_MODE = "postgres"; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { CapturePasswordResetDelivery, setPasswordResetDeliveryForTests } = require("../services/passwordResetDelivery"); const delivery = new CapturePasswordResetDelivery(); setPasswordResetDeliveryForTests(delivery);
const app = require("../server"); const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const suffix = crypto.randomBytes(5).toString("hex"); const username = `edge_reset_${suffix}`; const email = `edge-reset-${suffix}@example.test`; const oldPassword = "Edge-reset-old!"; const newPassword = "Edge-reset-new!";
let server; let browser; let userId;
async function focused(locator) { return locator.evaluate(node => node === document.activeElement); }

(async () => {
  server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${server.address().port}`; process.env.APP_ORIGIN = base;
  browser = await chromium.launch({ executablePath: EDGE, headless: true }); const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
  const consoleErrors = []; const pageErrors = []; const unexpected = []; let completeRequests = 0;
  page.on("console", item => { if (item.type() === "error") consoleErrors.push(item.text()); }); page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => { if (request.url().endsWith("/api/auth/password-reset/complete")) completeRequests += 1; });
  page.on("response", response => { if ([401, 403, 500].includes(response.status())) unexpected.push(`${response.status()} ${response.url()}`); });

  await page.goto(base); await page.getByRole("button", { name: /Hesap oluştur/ }).click(); await page.getByLabel("Kullanıcı adı", { exact: true }).fill(username); await page.getByLabel("E-posta \(opsiyonel\)").fill(email); await page.getByLabel("Parola", { exact: true }).fill(oldPassword); await page.getByLabel("Parola tekrar").fill(oldPassword); await page.getByRole("button", { name: "Hesap oluştur" }).click(); await page.locator("#editProfileButton").waitFor({ state: "visible" });
  const session = await page.evaluate(async () => await (await fetch("/api/auth/session")).json()); userId = session.user.id; await page.getByRole("button", { name: /Çıkış yap/ }).click(); await page.locator("[data-open-login]").waitFor();

  const loginOpener = page.locator("[data-open-login]"); await loginOpener.focus(); await loginOpener.click(); const forgot = page.getByRole("button", { name: "Parolamı unuttum" }); await forgot.click();
  const forgotForm = page.locator("[data-forgot-password-form]"); await forgotForm.waitFor(); assert.equal(await focused(page.locator("#auth-resetIdentifier")), true); assert.equal(await page.getByLabel("Kullanıcı adı veya e-posta").getAttribute("autocomplete"), "username"); assert.equal(await page.locator(".auth-message").getAttribute("aria-live"), "polite");
  await page.keyboard.press("Shift+Tab"); const close = page.getByRole("button", { name: "Hesap penceresini kapat" }); assert.equal(await focused(close), true); await page.keyboard.press("Escape"); await page.locator(".auth-shell").waitFor({ state: "hidden" }); assert.equal(await focused(loginOpener), true, "forgot focus restore");
  await loginOpener.click(); await page.getByRole("button", { name: "Parolamı unuttum" }).click(); await page.getByLabel("Kullanıcı adı veya e-posta").fill(username); await page.getByLabel("Kullanıcı adı veya e-posta").press("Enter");
  const generic = page.locator(".auth-message.is-success"); await generic.waitFor(); assert.match(await generic.textContent(), /Eğer bu bilgilerle eşleşen bir hesap varsa/); const captured = delivery.latest(userId); assert.ok(captured?.token); assert.equal((await generic.textContent()).includes(captured.token), false);

  await page.goto(`${base}/?recovery=1#reset-password=${encodeURIComponent(captured.token)}`); const resetForm = page.locator("[data-reset-password-form]"); await resetForm.waitFor(); assert.equal(new URL(page.url()).hash, "", "token removed from URL"); assert.equal((await page.locator("body").textContent()).includes(captured.token), false, "token absent from DOM");
  assert.equal(await focused(page.locator("#auth-resetPassword")), true); assert.equal(await page.getByLabel("Yeni parola", { exact: true }).getAttribute("autocomplete"), "new-password"); assert.equal(await page.getByLabel("Yeni parola tekrar").getAttribute("autocomplete"), "new-password");
  await page.getByLabel("Yeni parola", { exact: true }).fill(newPassword); await page.getByLabel("Yeni parola tekrar").fill("Mismatch-reset!"); const beforeMismatch = completeRequests; await page.getByLabel("Yeni parola tekrar").press("Enter"); await page.locator(".auth-message.is-error").waitFor(); assert.match(await page.locator(".auth-message.is-error").textContent(), /eşleşmiyor/); assert.equal(completeRequests, beforeMismatch);
  await page.getByLabel("Yeni parola tekrar").fill(newPassword); await page.getByLabel("Yeni parola tekrar").press("Enter"); await page.locator(".auth-message.is-success").waitFor(); assert.match(await page.locator(".auth-message.is-success").textContent(), /başarıyla sıfırlandı/); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await page.waitForLoadState("domcontentloaded"); await page.locator("[data-open-login]").waitFor(); await page.locator("[data-open-login]").click(); await page.getByLabel("Kullanıcı adı veya e-posta").fill(username); await page.getByLabel("Parola", { exact: true }).fill(newPassword); await page.getByLabel("Parola", { exact: true }).press("Enter"); await page.locator("#editProfileButton").waitFor({ state: "visible" });
  assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []); assert.deepEqual(unexpected, []);
  console.log("PASS  real Edge forgot/reset generic UX, adapter token, fragment removal, a11y, 390px, and new-password login");
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server?.listening) await new Promise(resolve => server.close(resolve));
  try { if (userId) { await pool.query("DELETE FROM sessions WHERE user_id=$1", [userId]); await pool.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [userId]); await pool.query("DELETE FROM users WHERE id=$1", [userId]); } } finally { await pool.end(); setPasswordResetDeliveryForTests(null); }
});
