"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const password = require("../auth/password");
const resetToken = require("../auth/resetToken");
const authService = require("../services/authService");
const db = require("../db");
const { CapturePasswordResetDelivery, UnavailablePasswordResetDelivery } = require("../services/passwordResetDelivery");
const { createAuthRouter } = require("../routes/auth");

async function withServer(service, callback) {
  const limiter = { consume: () => ({ allowed: true }), reset: () => {} }; const app = express(); app.use(express.json());
  app.use("/api/auth", createAuthRouter({ authService: service, limiter, getConfig: () => ({ authMode: "production", cookieName: "yd_session", cookieSecure: false, cookieSameSite: "Lax" }), validateAuthOrigin: () => true }));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); }
}

async function run() {
  const tokenA = resetToken.createToken(); const tokenB = resetToken.createToken(); assert.notEqual(tokenA, tokenB); assert.ok(tokenA.length >= 43); assert.equal(resetToken.hashToken(tokenA).length, 64); assert.equal(resetToken.hashToken(tokenA).includes(tokenA), false);
  const originalTransaction = db.withTransaction; const user = { id: "u1", username: "reset.user", email: "reset@example.test", role: "USER", status: "ACTIVE", password_hash: password.hashPassword("Old-password!") };
  const delivery = new CapturePasswordResetDelivery(); let created; let invalidated = 0; let cleaned = 0;
  const resetRepository = { cleanup: async limit => { cleaned = limit; }, invalidateUnusedForUser: async id => { assert.equal(id, "u1"); invalidated += 1; }, create: async (id, raw, ttl) => { created = { id, raw, ttl, hash: resetToken.hashToken(raw) }; } };
  db.withTransaction = async callback => callback({ transaction: true });
  try {
    const existing = await authService.requestPasswordReset("reset.user", { users: { findByIdentifier: async () => user }, passwordResets: resetRepository, delivery });
    const missing = await authService.requestPasswordReset("missing.user", { users: { findByIdentifier: async () => null }, passwordResets: resetRepository, delivery });
    assert.deepEqual(existing, missing); assert.equal(existing.message, authService.PASSWORD_RESET_REQUEST_MESSAGE); assert.equal(cleaned, 100); assert.equal(invalidated, 1); assert.equal(created.ttl, 1800);
    assert.equal(created.raw, delivery.latest("u1").token); assert.notEqual(created.hash, created.raw);
    const noDelivery = await authService.requestPasswordReset("reset.user", { users: { findByIdentifier: async () => user }, passwordResets: resetRepository, delivery: new UnavailablePasswordResetDelivery() }); assert.deepEqual(noDelivery, existing); assert.equal(invalidated, 1);

    let savedHash; let used; let revoked;
    const completeResetRepository = { findValidForUpdate: async raw => raw === "valid-token" ? { id: "r1", user_id: "u1" } : null, markUsed: async id => { used = id; } };
    const users = { findById: async () => user, updatePasswordHash: async (id, hash) => { assert.equal(id, "u1"); savedHash = hash; } };
    const sessions = { revokeAllUserSessions: async id => { revoked = id; } };
    await assert.rejects(() => authService.completePasswordReset({ token: "invalid", newPassword: "New-password!" }, { users, sessions, passwordResets: completeResetRepository }), error => error.code === "RESET_TOKEN_INVALID");
    await assert.rejects(() => authService.completePasswordReset({ token: "valid-token", newPassword: "short" }, { users, sessions, passwordResets: completeResetRepository }), error => error.code === "INVALID_PASSWORD");
    await authService.completePasswordReset({ token: "valid-token", newPassword: "New-password!", userId: "victim", role: "TEACHER", passwordHash: "plain" }, { users, sessions, passwordResets: completeResetRepository });
    assert.equal(password.verifyPassword("New-password!", savedHash), true); assert.equal(savedHash.includes("New-password!"), false); assert.equal(used, "r1"); assert.equal(revoked, "u1");
  } finally { db.withTransaction = originalTransaction; }

  const publicService = {
    PASSWORD_RESET_REQUEST_MESSAGE: authService.PASSWORD_RESET_REQUEST_MESSAGE,
    async requestPasswordReset(identifier) { return { ok: true, message: authService.PASSWORD_RESET_REQUEST_MESSAGE, internal: identifier === "exists" }; },
    async completePasswordReset(input) { if (input.token !== "valid") { const error = new Error("RESET_TOKEN_INVALID"); error.code = "RESET_TOKEN_INVALID"; throw error; } return { ok: true }; }
  };
  await withServer(publicService, async base => {
    const post = (path, body) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const existing = await post("/api/auth/password-reset/request", { identifier: "exists", userId: "victim" }); const existingBody = await existing.json();
    const missing = await post("/api/auth/password-reset/request", { identifier: "missing", role: "TEACHER" }); const missingBody = await missing.json();
    assert.equal(existing.status, missing.status); assert.deepEqual(existingBody, missingBody); assert.equal(existingBody.token, undefined); assert.deepEqual(Object.keys(existingBody).sort(), ["message", "ok"]);
    const invalid = await post("/api/auth/password-reset/complete", { token: "bad", newPassword: "New-password!", userId: "victim", role: "TEACHER" }); const invalidBody = await invalid.json(); assert.equal(invalid.status, 400); assert.equal(invalidBody.error.code, "RESET_TOKEN_INVALID");
    const valid = await post("/api/auth/password-reset/complete", { token: "valid", newPassword: "New-password!", passwordHash: "plain" }); const validBody = await valid.json(); assert.equal(valid.status, 200); assert.equal(validBody.token, undefined); assert.equal(validBody.passwordHash, undefined);
  });
  console.log("PASS  password reset entropy, enumeration, delivery abstraction, hash-only token, TTL, policy, ownership, session revoke, and safe HTTP contract");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
