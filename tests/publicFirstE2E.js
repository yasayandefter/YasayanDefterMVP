"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const port = 35000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${port}`;
const persistenceFiles = ["memory.json", "yasayan_deefter_memory.json"].map(file => path.join(root, file));
const digest = file => fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
const before = new Map(persistenceFiles.map(file => [file, digest(file)]));
let child; let browser;

async function ready() {
  for (let index = 0; index < 80; index += 1) {
    try { if ((await fetch(`${base}/api/status`)).ok) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("PUBLIC_TEST_SERVER_NOT_READY");
}

(async () => {
  assert.ok(fs.existsSync(EDGE), "Microsoft Edge bulunamadı");
  child = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, PORT: String(port), VERCEL: "1", NODE_ENV: "production", AUTH_MODE: "", STORAGE_MODE: "", DATABASE_URL: "", ACCESS_MODE: "" }, stdio: ["ignore", "pipe", "pipe"] });
  await ready();
  browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = []; const pageErrors = []; const failed = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", request => failed.push(request.url()));

  await page.goto(base, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#brainEngineWorkspace").isVisible(), true);
  assert.equal(await page.locator(".auth-shell").isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  const research = await page.evaluate(async () => {
    const response = await fetch("/api/research?q=" + encodeURIComponent("Mars gezegeni"));
    return { status: response.status, body: await response.json() };
  });
  assert.equal(research.status, 401);
  assert.equal(research.body.ok, false);
  assert.equal(research.body.error.code, "UNAUTHENTICATED");

  const ctas = page.getByRole("link", { name: /Giriş yap ve araştır/ });
  assert.equal(await ctas.count(), 2);
  assert.deepEqual(await ctas.evaluateAll(nodes => nodes.map(node => node.getAttribute("href"))), ["#login", "#login"]);
  await ctas.first().click();
  await page.locator("[data-login-form]").waitFor();
  assert.equal(await page.locator(".auth-card").getAttribute("aria-modal"), "true");

  assert.deepEqual(Object.fromEntries(persistenceFiles.map(file => [file, digest(file)])), Object.fromEntries(before));
  assert.deepEqual(failed, []);
  assert.equal(consoleErrors.length, 1);
  assert.match(consoleErrors[0], /401 \(Unauthorized\)/);
  assert.deepEqual(pageErrors, []);
  console.log("PASS  public landing CTA opens login and unauthenticated research returns 401 UNAUTHENTICATED with no persistence");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
});
