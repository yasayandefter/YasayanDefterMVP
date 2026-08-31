"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const { chromium } = require("playwright-core");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
if (!fs.existsSync(EDGE)) { console.log("SKIP  collection media browser: Edge unavailable"); process.exit(0); }
const appPort = 54000 + crypto.randomInt(300), storagePort = appPort + 400, base = `http://127.0.0.1:${appPort}`, storageBase = `http://127.0.0.1:${storagePort}`;
const source = fs.readFileSync("assets/js/collection-media.js");
const css = fs.readFileSync("assets/css/collection-media-15-7.css");
const svg = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#12324b"/><text x="50%" y="50%" fill="white" text-anchor="middle">Private preview</text></svg>');
let media = [
  { id: "10000000-0000-4000-8000-000000000001", safeFilename: "plan.pdf", mediaType: "PDF", mimeType: "application/pdf", sizeBytes: 1200, status: "READY", createdAt: "2026-09-01T00:00:00Z" },
  { id: "10000000-0000-4000-8000-000000000002", safeFilename: "image.png", mediaType: "IMAGE", mimeType: "image/png", sizeBytes: 2200, status: "READY", createdAt: "2026-09-01T00:00:00Z" },
  { id: "10000000-0000-4000-8000-000000000003", safeFilename: "audio.mp3", mediaType: "AUDIO", mimeType: "audio/mpeg", sizeBytes: 3200, status: "READY", createdAt: "2026-09-01T00:00:00Z" },
  { id: "10000000-0000-4000-8000-000000000004", safeFilename: "video.mp4", mediaType: "VIDEO", mimeType: "video/mp4", sizeBytes: 4200, status: "READY", createdAt: "2026-09-01T00:00:00Z" }
];
let accessCount = 0, signedCookie = null, initCount = 0, retryAttempts = 0, removeCount = 0, deleteCount = 0;

function json(response, status, value) { response.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); response.end(JSON.stringify(value)); }
const app = http.createServer((request, response) => {
  const url = new URL(request.url, base), chunks = []; request.on("data", chunk => chunks.push(chunk)); request.on("end", () => {
    if (url.pathname === "/") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": "yd_session=must-not-leave-app; SameSite=Lax" }); response.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/media.css"><style>body{margin:0;background:#050d19;color:#e8f4fa;font-family:Arial}.test-shell{height:100dvh;padding:12px;box-sizing:border-box}.yd-collection-detail-body{height:calc(100dvh - 80px)}</style></head><body><main class="test-shell"><button id="upload">Medya Yükle</button><p id="status" role="status" aria-live="polite"></p><div class="yd-collection-detail-body"><section><div id="grid" class="yd-collection-media-grid"></div></section><aside id="preview" class="yd-media-preview" hidden></aside></div></main><script>window.confirm=()=>true;window.states=[];</script><script src="/collection-media.js"></script><script>YDCollectionMedia.mount({collectionId:'20000000-0000-4000-8000-000000000001',grid:document.getElementById('grid'),previewHost:document.getElementById('preview'),status:document.getElementById('status')}).then(m=>{window.mount=m;document.getElementById('upload').onclick=()=>{let d=m.openUpload(document.getElementById('upload'));new MutationObserver(()=>window.states.push(d.dataset.mediaState)).observe(d,{attributes:true,attributeFilter:['data-media-state']});};});</script></body></html>`); return; }
    if (url.pathname === "/collection-media.js") { response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }); response.end(source); return; }
    if (url.pathname === "/media.css") { response.writeHead(200, { "Content-Type": "text/css; charset=utf-8" }); response.end(css); return; }
    if (url.pathname.endsWith("/media") && request.method === "GET") return json(response, 200, { ok: true, media });
    if (url.pathname === "/api/media/uploads" && request.method === "POST") {
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      if (body.filename === "auth.pdf") return json(response, 401, { ok: false, error: { code: "UNAUTHENTICATED", message: "Oturum gerekli" } });
      if (body.filename === "storage.pdf") return json(response, 503, { ok: false, error: { code: "MEDIA_STORAGE_DISABLED", message: "Depolama kapalı" } });
      initCount += 1; if (body.filename === "retry.pdf") retryAttempts += 1; const id = `30000000-0000-4000-8000-${String(initCount).padStart(12, "0")}`, fail = body.filename === "retry.pdf" && retryAttempts === 1;
      return json(response, 201, { ok: true, asset: { id, status: "PENDING" }, upload: { url: storageBase + (fail ? "/fail" : "/put"), method: "PUT", headers: { "Content-Type": body.mimeType }, expiresInSeconds: 600 } });
    }
    if (/\/api\/media\/[^/]+\/complete$/.test(url.pathname) && request.method === "POST") { const id = url.pathname.split("/")[3], asset = { id, safeFilename: "uploaded.pdf", mediaType: "PDF", mimeType: "application/pdf", sizeBytes: 512, status: "READY", createdAt: new Date().toISOString() }; media.push(asset); return json(response, 200, { ok: true, asset }); }
    if (/\/api\/media\/[^/]+\/access$/.test(url.pathname)) { accessCount += 1; return json(response, 200, { ok: true, access: { url: svg, method: "GET", expiresInSeconds: 60 } }); }
    if (/\/api\/collections\/[^/]+\/media\/[^/]+$/.test(url.pathname) && request.method === "DELETE") { removeCount += 1; const id = url.pathname.split("/").at(-1); media = media.filter(item => item.id !== id); return json(response, 200, { ok: true, removed: true }); }
    if (/\/api\/media\/[^/]+$/.test(url.pathname) && request.method === "DELETE") { deleteCount += 1; const id = url.pathname.split("/").at(-1); media = media.filter(item => item.id !== id); return json(response, 200, { ok: true, deleted: true }); }
    json(response, 404, { ok: false });
  });
});
const storage = http.createServer((request, response) => { signedCookie = request.headers.cookie || null; request.resume(); request.on("end", () => { response.writeHead(request.url === "/fail" ? 500 : 200, { "Access-Control-Allow-Origin": base, "Access-Control-Allow-Methods": "PUT", "Access-Control-Allow-Headers": "Content-Type" }); response.end(); }); });
let browser;

(async () => {
  await Promise.all([new Promise(resolve => app.listen(appPort, resolve)), new Promise(resolve => storage.listen(storagePort, resolve))]);
  browser = await chromium.launch({ executablePath: EDGE, headless: true }); const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }); const errors = []; page.on("pageerror", error => errors.push(error.message)); await page.goto(base);
  await page.locator(".yd-media-card").first().waitFor(); assert.equal(await page.locator(".yd-media-card").count(), 4); for (const type of ["pdf", "image", "audio", "video"]) assert.equal(await page.locator(`.yd-media-card[data-media-type="${type}"]`).count(), 1);
  const imageCard = page.locator('.yd-media-card[data-media-type="image"]'); await imageCard.focus(); await page.keyboard.press("Enter"); await page.locator("#preview img").waitFor(); assert.equal(accessCount, 1); assert.equal(await page.evaluate(() => { const button = document.querySelector("#preview button"); if (!button) return false; button.click(); return true; }), true); assert.equal(await page.locator("#preview img").count(), 0);
  await page.locator('.yd-media-card[data-media-type="image"] button').click(); await page.getByRole("button", { name: "Koleksiyondan Çıkar", exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll(".yd-media-card").length === 3); assert.deepEqual({ removeCount, deleteCount }, { removeCount: 1, deleteCount: 0 });
  await page.locator('.yd-media-card[data-media-type="video"] button').click(); await page.getByRole("button", { name: "Medyayı Kalıcı Sil", exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll(".yd-media-card").length === 2); assert.deepEqual({ removeCount, deleteCount }, { removeCount: 1, deleteCount: 1 });
  await page.locator("#upload").click(); await page.locator('input[type="file"]').setInputFiles({ name: "upload.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(512, 1) }); await page.locator("#collectionMediaUploadDialog button").filter({ hasText: "Yükle" }).click({ force: true }); await page.getByText("uploaded.pdf", { exact: true }).waitFor(); assert.equal(signedCookie, null); assert.ok(await page.evaluate(() => window.states.includes("verifying") && window.states.includes("success")));
  await page.locator("#upload").click(); await page.locator('input[type="file"]').setInputFiles({ name: "bad.exe", mimeType: "application/octet-stream", buffer: Buffer.from("bad") }); assert.equal(await page.locator("#collectionMediaUploadDialog").getAttribute("data-media-state"), "unsupported-file"); await page.locator("#collectionMediaUploadDialog button").filter({ hasText: "Vazgeç" }).click({ force: true });
  await page.locator("#upload").click(); await page.locator('input[type="file"]').setInputFiles({ name: "retry.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(256, 2) }); await page.locator("#collectionMediaUploadDialog").getByRole("button", { name: "Yükle", exact: true }).click(); await page.locator('#collectionMediaUploadDialog[data-media-state="error"]').waitFor(); await page.locator("#collectionMediaUploadDialog").getByRole("button", { name: "Yeniden Dene", exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll(".yd-media-card").length === 4); assert.equal(retryAttempts, 2);
  await page.locator("#upload").click(); await page.locator('input[type="file"]').setInputFiles({ name: "auth.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(64, 3) }); await page.locator("#collectionMediaUploadDialog").getByRole("button", { name: "Yükle", exact: true }).click(); await page.locator('#collectionMediaUploadDialog[data-media-state="auth-expired"]').waitFor(); await page.locator("#collectionMediaUploadDialog").getByRole("button", { name: "Vazgeç", exact: true }).click();
  await page.locator("#upload").click(); await page.locator('input[type="file"]').setInputFiles({ name: "storage.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(64, 4) }); await page.locator("#collectionMediaUploadDialog").getByRole("button", { name: "Yükle", exact: true }).click(); await page.locator('#collectionMediaUploadDialog[data-media-state="storage-unavailable"]').waitFor(); await page.locator("#collectionMediaUploadDialog").getByRole("button", { name: "Vazgeç", exact: true }).click();
  for (const width of [360, 390, 768, 1024, 1366]) { await page.setViewportSize({ width, height: width < 700 ? 844 : 768 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `overflow ${width}`); }
  assert.deepEqual(errors, []); console.log("PASS  collection media real Edge cards, keyboard preview, fresh access, distinct remove/delete, direct PUT without app cookie, progress/verification/success, retry reauthorization, auth expiry, storage unavailable, local rejection and responsive bounds");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); await Promise.all([new Promise(resolve => app.close(resolve)), new Promise(resolve => storage.close(resolve))]); });
