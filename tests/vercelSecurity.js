"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const expectedHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload"
};
const privatePaths = [
  "/server.js",
  "/memory.json",
  "/yasayan_deefter_memory.json",
  "/data/students.json",
  "/data/classrooms.json",
  "/data/quiz-attempts.json",
  "/routes/auth.js",
  "/services/authService.js",
  "/repositories/usersRepository.js",
  "/brain/research.js",
  "/package.json",
  "/package-lock.json",
  "/vercel.json",
  "/.git/config",
  "/.env",
  "/.env.local"
];

function assertVercelContract() {
  const staticSources = config.builds.filter(build => build.use === "@vercel/static").map(build => build.src).sort();
  assert.deepEqual(staticSources, ["assets/**/*", "index.html"]);
  assert.equal(config.builds.some(build => build.src === "**/*"), false);
  const headerRoute = config.routes[0];
  assert.equal(headerRoute.src, "/(.*)");
  assert.equal(headerRoute.continue, true);
  assert.deepEqual(headerRoute.headers, expectedHeaders);
  assert.deepEqual(config.routes.slice(1, 5).map(route => route.src), ["/api/(.*)", "/", "/index\\.html", "/assets/(.*)"]);
  const catchAll = config.routes.at(-1);
  assert.equal(catchAll.src, "/(.*)");
  assert.equal(catchAll.status, 404);
  assert.equal(catchAll.dest, undefined);
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

async function waitForServer(base, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error("SECURITY_TEST_SERVER_EXITED");
    try { if ((await fetch(`${base}/api/status`)).ok) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("SECURITY_TEST_SERVER_NOT_READY");
}

function assertSecurityHeaders(response, includeHsts = false) {
  for (const [name, value] of Object.entries(expectedHeaders)) {
    if (!includeHsts && name === "Strict-Transport-Security") continue;
    assert.equal(response.headers.get(name), value, `${name} header mismatch`);
  }
}

(async () => {
  assertVercelContract();
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ACCESS_MODE: "public-demo", AUTH_MODE: "local", STORAGE_MODE: "json", DATABASE_URL: "" },
    stdio: ["ignore", "ignore", "ignore"]
  });
  try {
    await waitForServer(base, child);
    for (const privatePath of privatePaths) {
      const response = await fetch(base + privatePath);
      assert.notEqual(response.status, 200, `${privatePath} must not be public`);
      const body = await response.text();
      assert.equal(/password_hash|claim_code|session_token|DATABASE_URL|express\s*=\s*require/i.test(body), false, `${privatePath} leaked sensitive content`);
    }
    const home = await fetch(base + "/");
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type") || "", /text\/html/);
    assertSecurityHeaders(home);
    const css = await fetch(base + "/assets/css/style.css");
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type") || "", /text\/css/);
    assertSecurityHeaders(css);
    const js = await fetch(base + "/assets/js/app.js");
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type") || "", /javascript/);
    assertSecurityHeaders(js);
    const status = await fetch(base + "/api/status");
    assert.equal(status.status, 200);
    assert.equal((await status.json()).ok, true);
    assertSecurityHeaders(status);
    console.log("PASS  Vercel static allowlist, source/data denial, public assets, and HTML/static/API security header contract");
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve));
    }
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
