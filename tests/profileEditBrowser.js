const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const { chromium } = require("playwright-core");

if (!process.env.TEST_DATABASE_URL) {
  console.log("SKIP  profile edit Edge E2E: TEST_DATABASE_URL is not set");
  process.exit(0);
}

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
if (!fs.existsSync(EDGE)) {
  console.log("SKIP  profile edit Edge E2E: Edge is not installed");
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const suffix = crypto.randomBytes(5).toString("hex");
const oldName = `edge_profile_${suffix}`;
const newName = `edge_updated_${suffix}`;
const email = `edge-${suffix}@example.test`;
const password = "Profile-edge-password!";
let child;
let browser;

async function wait(base) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/status`)).ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("SERVER_TIMEOUT");
}

async function login(page, identifier) {
  await page.locator("[data-open-login]").click();
  await page.getByLabel("Kullanıcı adı veya e-posta").fill(identifier);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByLabel("Parola", { exact: true }).press("Enter");
  await page.locator("#editProfileButton").waitFor({ state: "visible" });
}

async function isFocused(locator) {
  return locator.evaluate(node => node === document.activeElement);
}

(async () => {
  const port = 37000 + crypto.randomInt(9000);
  const base = `http://localhost:${port}`;
  child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), AUTH_MODE: "production", ACCESS_MODE: "authenticated", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" },
    stdio: ["ignore", "ignore", "ignore"]
  });
  await wait(base);
  browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
  const consoleErrors = [];
  const pageErrors = [];
  const unexpectedResponses = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("response", response => {
    if ([401, 403, 500].includes(response.status())) unexpectedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(base);
  await page.getByRole("button", { name: /Hesap oluştur/ }).click();
  await page.getByLabel("Kullanıcı adı", { exact: true }).fill(oldName);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByLabel("Parola tekrar").fill(password);
  await page.getByRole("button", { name: "Hesap oluştur" }).click();
  await page.locator("#editProfileButton").waitFor({ state: "visible" });
  await page.locator(".workspace-dialog[open]").waitFor();
  await page.getByRole("button", { name: "Şimdilik geç" }).click();
  await page.locator(".workspace-dialog").waitFor({ state: "hidden" });

  const opener = page.locator("#editProfileButton");
  await opener.focus();
  await opener.click();
  const form = page.locator("[data-profile-form]");
  await form.waitFor();
  const dialog = page.locator('.auth-card[role="dialog"]');
  assert.equal(await dialog.getAttribute("aria-modal"), "true");
  assert.equal(await isFocused(page.locator("#auth-profileUsername")), true, "initial focus");
  for (const id of ["profileUsername", "profileEmail", "profileDisplayName", "currentPassword"]) {
    assert.ok(await page.locator(`label[for="auth-${id}"]`).count(), `${id} label`);
  }
  assert.equal(await page.locator(".auth-message").getAttribute("aria-live"), "polite");

  await page.keyboard.press("Shift+Tab");
  const closeButton = page.getByRole("button", { name: "Hesap penceresini kapat" });
  assert.equal(await isFocused(closeButton), true, "tab navigation to close");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await isFocused(page.getByRole("button", { name: "Kaydet", exact: true })), true, "reverse focus trap");
  await page.keyboard.press("Tab");
  assert.equal(await isFocused(closeButton), true, "forward focus trap");
  await page.keyboard.press("Escape");
  await page.locator(".auth-shell").waitFor({ state: "hidden" });
  assert.equal(await isFocused(opener), true, "focus restore");

  await opener.click();
  await page.getByLabel("Kullanıcı adı").fill(newName);
  await page.getByLabel("E-posta (opsiyonel)").fill(email);
  await page.getByLabel("Görünen ad (opsiyonel)").fill("Edge Profile");
  await page.getByLabel("Mevcut parola").fill(password);
  await page.getByLabel("Mevcut parola").press("Enter");
  await page.locator(".auth-shell").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#commercialProfileName").textContent(), "Edge Profile");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);

  await page.reload();
  await page.locator("#editProfileButton").waitFor({ state: "visible" });
  assert.equal((await page.evaluate(async () => await (await fetch("/api/auth/session")).json())).user.username, newName);
  await page.getByRole("button", { name: /Çıkış yap/ }).click();
  await page.locator("[data-open-login]").waitFor();
  await login(page, newName);
  await page.getByRole("button", { name: /Çıkış yap/ }).click();
  await page.locator("[data-open-login]").waitFor();
  await login(page, email);

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(unexpectedResponses, []);
  console.log("PASS  real Edge profile edit, a11y, 390px, refresh, username/email login, and clean runtime");
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (child) child.kill("SIGTERM");
  try {
    const user = await pool.query("SELECT id FROM users WHERE username=$1 OR email=$2", [newName, email]);
    if (user.rows[0]) {
      await pool.query("DELETE FROM sessions WHERE user_id=$1", [user.rows[0].id]);
      await pool.query("DELETE FROM students WHERE user_id=$1", [user.rows[0].id]);
      await pool.query("DELETE FROM users WHERE id=$1", [user.rows[0].id]);
    }
  } finally {
    await pool.end();
  }
});
