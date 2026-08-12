"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { AuthRateLimiter, RATE_LIMIT_MESSAGE, hashedIdentity } = require("../middleware/authRateLimit");
const { createAuthRouter } = require("../routes/auth");

function request(ip) { return { ip, socket: { remoteAddress: ip }, headers: { "x-forwarded-for": "198.51.100.99" } }; }

async function withServer(router, callback) {
  const app = express(); app.use(express.json()); app.use("/api/auth", router);
  app.get("/api/research", (_req, res) => res.json({ ok: true, public: true }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function run() {
  let now = 1000;
  const policies = { LOGIN: { limit: 2, windowMs: 10000 }, REGISTER: { limit: 1, windowMs: 20000 }, CLAIM: { limit: 1, windowMs: 30000 } };
  const limiter = new AuthRateLimiter({ now: () => now, maxEntries: 2, policies });
  const first = request("127.0.0.1"); const second = request("127.0.0.2");
  assert.notEqual(hashedIdentity(first), "127.0.0.1");
  assert.equal(hashedIdentity(first), hashedIdentity({ ...first, headers: { "x-forwarded-for": "203.0.113.7" } }), "untrusted forwarding headers must not affect the key");
  assert.equal(limiter.consume("LOGIN", first).allowed, true);
  assert.equal(limiter.consume("LOGIN", first).allowed, true);
  const blocked = limiter.consume("LOGIN", first); assert.equal(blocked.allowed, false); assert.equal(blocked.retryAfter, 10);
  assert.equal(limiter.consume("LOGIN", second).allowed, true, "IP keys must be isolated");
  now += 10000; assert.equal(limiter.consume("LOGIN", first).allowed, true, "window must reset");
  limiter.consume("REGISTER", first); limiter.consume("CLAIM", second); assert.ok(limiter.size <= 2, "store must remain bounded");

  let loginSucceeds = false; let logoutCalls = 0; let sessionCalls = 0;
  const service = {
    async login() { if (!loginSucceeds) { const error = new Error("INVALID_CREDENTIALS"); error.code = "INVALID_CREDENTIALS"; throw error; } return { token: "session", user: { id: "u1" } }; },
    async register() { const error = new Error("INVALID_USERNAME"); error.code = "INVALID_USERNAME"; throw error; },
    async claimStudent() { const error = new Error("CLAIM_INVALID"); error.code = "CLAIM_INVALID"; throw error; },
    async logout() { logoutCalls += 1; },
    async session() { sessionCalls += 1; return { authenticated: true, user: { id: "u1" } }; }
  };
  const routeLimiter = new AuthRateLimiter({ now: () => now, maxEntries: 20, policies });
  const router = createAuthRouter({ authService: service, limiter: routeLimiter, getConfig: () => ({ authMode: "production", cookieName: "yd_session", sessionTtlSeconds: 60, cookieSecure: false, cookieSameSite: "Lax" }), validateAuthOrigin: () => true });
  await withServer(router, async base => {
    const post = (path, body = {}) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post("/api/auth/login")).status, 401);
    assert.equal((await post("/api/auth/login")).status, 401);
    const limited = await post("/api/auth/login"); const payload = await limited.json();
    assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "10");
    assert.deepEqual(payload.error, { code: "RATE_LIMITED", message: RATE_LIMIT_MESSAGE });
    now += 10000; loginSucceeds = true; assert.equal((await post("/api/auth/login")).status, 200);
    loginSucceeds = false; assert.equal((await post("/api/auth/login")).status, 401, "successful login must reset its bucket");
    assert.equal((await post("/api/auth/register")).status, 400); assert.equal((await post("/api/auth/register")).status, 429);
    assert.equal((await post("/api/auth/claim")).status, 400); assert.equal((await post("/api/auth/claim")).status, 429);
    for (let index = 0; index < 4; index += 1) assert.equal((await post("/api/auth/logout")).status, 200, "logout must not be limited");
    for (let index = 0; index < 4; index += 1) assert.equal((await fetch(`${base}/api/auth/session`)).status, 200, "session restore must not be limited");
    assert.equal((await fetch(`${base}/api/research?q=Mars`)).status, 200, "public research must not be limited");
  });
  assert.equal(logoutCalls, 4); assert.equal(sessionCalls, 4);
  console.log("PASS  auth rate limits, 429 contract, retry, reset, isolation, memory bound, logout, session, and public route isolation");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
