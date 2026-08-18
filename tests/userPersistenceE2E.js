"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const { Pool } = require("pg");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  USER persistence Edge E2E: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const suffix = crypto.randomBytes(6).toString("hex");
const username = `pilot_user_${suffix}`;
const password = "Pilot-user-password!";
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
let child; let browser; let userId;

async function waitFor(base) { for (let i = 0; i < 80; i += 1) { try { if ((await fetch(base + "/api/status")).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("SERVER_NOT_READY"); }
async function login(page) { await page.locator("[data-open-login]").click(); await page.getByLabel("Kullanıcı adı veya e-posta").fill(username); await page.getByLabel("Parola", { exact: true }).fill(password); await page.getByLabel("Parola", { exact: true }).press("Enter"); await page.locator("[data-auth-user]").waitFor(); }
async function logout(page) { await page.getByRole("button", { name: "Çıkış yap" }).click(); await page.locator("[data-open-login]").waitFor(); }

(async () => {
  assert.equal(require("node:fs").existsSync(EDGE), true);
  const port = 35000 + crypto.randomInt(8000); const base = `http://localhost:${port}`;
  child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] });
  await waitFor(base); browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 850 } });
  await context.route("https://fonts.googleapis.com/**", route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  const page = await context.newPage(); const consoleErrors = []; const pageErrors = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); }); page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(base); await page.locator("[data-open-register]").click(); await page.getByLabel("Kullanıcı adı", { exact: true }).fill(username); await page.getByLabel("Parola", { exact: true }).fill(password); await page.getByLabel("Parola tekrar").fill(password); await page.getByRole("button", { name: "Hesap oluştur" }).click(); await page.locator("[data-auth-user]").waitFor(); await page.locator(".workspace-dialog[open]").waitFor(); await page.getByRole("button", { name: "Şimdilik geç" }).click(); await page.locator(".workspace-dialog").waitFor({ state: "hidden" });
  userId = await page.evaluate(async () => (await (await fetch("/api/auth/session")).json()).user.id);
  await page.waitForFunction(() => document.querySelector("#commercialStreak")?.textContent === "0 gün" && document.querySelector("#commercialGoalLabel")?.textContent === "0 / 5 araştırma");
  await page.locator("#questionInput").fill("Venüs gezegeni"); const research = page.waitForResponse(response => response.url().includes("/api/research") && response.status() === 200); await page.locator("#searchButton").click(); await research; await page.locator("#results.visible").waitFor();
  await page.waitForFunction(() => document.querySelector("#commercialStreak")?.textContent === "1 gün" && document.querySelector("#commercialGoalLabel")?.textContent === "1 / 5 araştırma");
  const save = page.waitForResponse(response => response.url().includes("/api/memory/save") && response.status() === 200); await page.locator("#saveTopicButton").click(); await save; assert.match(await page.locator("#saveTopicButton").textContent(),/Deftere kaydedildi|Defterde kayıtlı/);
  assert.equal((await page.evaluate(async () => (await (await fetch("/api/memory/list")).json()).memories.some(item => /Venüs/i.test(item.title)))), true);
  const deleteButton=page.getByRole("button",{name:/Venüs.*araştırmasını sil/i});await deleteButton.waitFor();await page.setViewportSize({width:390,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0);await deleteButton.click();await page.locator("#memoryDeleteDialog").waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.textContent),"Vazgeç");await page.getByRole("button",{name:"Vazgeç"}).click();assert.equal(await deleteButton.count(),1);
  await deleteButton.click();const deleted=page.waitForResponse(response=>response.url().includes("/api/memory/")&&response.request().method()==="DELETE"&&response.status()===200);await page.getByRole("button",{name:"Kaydı sil"}).click();await deleted;await page.waitForFunction(()=>!document.querySelector("#notebookList")?.textContent.toLocaleLowerCase("tr-TR").includes("venüs"));
  assert.equal((await page.evaluate(async () => (await (await fetch("/api/memory/list")).json()).memories.some(item => /Venüs/i.test(item.title)))), false);assert.equal(await page.locator("#commercialStreak").textContent(),"1 gün");assert.equal(await page.locator("#commercialGoalLabel").textContent(),"1 / 5 araştırma");
  await page.evaluate(async()=>{const response=await fetch("/api/memory/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:"<img src=x onerror=window.__deleteXss=1>",title:"<img src=x onerror=window.__deleteXss=1>"})});if(!response.ok)throw new Error("XSS_FIXTURE_SAVE_FAILED")});await page.reload();await page.locator("[data-auth-user]").waitFor();await page.locator(".saved-title",{hasText:"<img src=x"}).waitFor({state:"attached"});assert.equal(await page.locator("#notebookList img").count(),0);assert.equal(await page.evaluate(()=>window.__deleteXss),undefined);await page.evaluate(async()=>{const list=await(await fetch("/api/memory/list")).json();const item=list.memories.find(memory=>memory.title.includes("<img src=x"));const response=await fetch("/api/memory/"+item.id,{method:"DELETE"});if(!response.ok)throw new Error("XSS_FIXTURE_DELETE_FAILED")});
  await page.reload(); await page.locator("[data-auth-user]").waitFor(); await page.waitForFunction(() => !document.querySelector("#notebookList")?.textContent.toLocaleLowerCase("tr-TR").includes("venüs") && document.querySelector("#commercialStreak")?.textContent === "1 gün" && document.querySelector("#commercialGoalLabel")?.textContent === "1 / 5 araştırma");
  await logout(page); await login(page); await page.waitForFunction(() => !document.querySelector("#notebookList")?.textContent.toLocaleLowerCase("tr-TR").includes("venüs") && document.querySelector("#commercialStreak")?.textContent === "1 gün" && document.querySelector("#commercialGoalLabel")?.textContent === "1 / 5 araştırma"); assert.equal(await page.evaluate(() => localStorage.getItem("yasayanDefterNotebook")), null);
  assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []); await context.close();
  console.log("PASS  real Edge authenticated Defterim delete confirmation, accessibility, responsive DOM removal, refresh/logout-login absence, and progress stability");
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  try { if (userId) { await pool.query("DELETE FROM xp_events WHERE owner_user_id=$1", [userId]); await pool.query("DELETE FROM quiz_attempts WHERE owner_user_id=$1", [userId]); await pool.query("DELETE FROM memory_records WHERE owner_user_id=$1", [userId]); await pool.query("DELETE FROM research_activity_events WHERE owner_user_id=$1", [userId]); await pool.query("DELETE FROM users WHERE id=$1", [userId]); } else { await pool.query("DELETE FROM users WHERE username=$1", [username]); } } finally { await pool.end(); }
});
