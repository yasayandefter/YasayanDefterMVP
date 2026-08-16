"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const password = require("../auth/password");
const authService = require("../services/authService");
const users = require("../repositories/usersRepository");
const db = require("../db");
const { createAuthRouter } = require("../routes/auth");

async function withServer(service, callback) {
  const limiter = { consume: () => ({ allowed: true }), reset: () => {} };
  const app = express(); app.use(express.json());
  app.use("/api/auth", createAuthRouter({ authService: service, limiter, getConfig: () => ({ authMode: "production", cookieName: "yd_session", cookieSecure: false, cookieSameSite: "Lax" }), validateAuthOrigin: () => true }));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); }
}

async function run() {
  const originalTransaction = db.withTransaction;
  const oldPassword = "Old-password-value!";
  const newPassword = "New-password-value!";
  const current = { id: "u1", role: "STUDENT", username: "student.one", password_hash: password.hashPassword(oldPassword), status: "ACTIVE", student_id: "student-1" };
  let savedHash; let revoked;
  const repository = { safeUser: users.safeUser, findById: async id => id === "u1" ? current : null, updatePasswordHash: async (id, hash, client) => { savedHash = hash; assert.equal(id, "u1"); assert.ok(client.transaction); } };
  const sessions = { findValidSession: async token => token === "session-a" ? { user_id: "u1", session_id: "sa" } : null, revokeOtherUserSessions: async (userId, sessionId, client) => { revoked = { userId, sessionId }; assert.ok(client.transaction); } };
  db.withTransaction = async callback => callback({ transaction: true });
  try {
    await assert.rejects(() => authService.changePassword(null, {}, { users: repository, sessions }), error => error.code === "UNAUTHENTICATED");
    await assert.rejects(() => authService.changePassword("session-a", { currentPassword: "wrong", newPassword }, { users: repository, sessions }), error => error.code === "INVALID_CREDENTIALS");
    await assert.rejects(() => authService.changePassword("session-a", { currentPassword: oldPassword, newPassword: "short" }, { users: repository, sessions }), error => error.code === "INVALID_PASSWORD");
    await assert.rejects(() => authService.changePassword("session-a", { currentPassword: oldPassword, newPassword: oldPassword }, { users: repository, sessions }), error => error.code === "PASSWORD_UNCHANGED");
    const result = await authService.changePassword("session-a", { currentPassword: oldPassword, newPassword, userId: "victim", role: "TEACHER", studentId: "other", schoolId: "other", passwordHash: "plain", status: "DISABLED" }, { users: repository, sessions });
    assert.equal(result.user.id, "u1"); assert.equal(result.user.role, "STUDENT"); assert.equal(result.user.studentId, "student-1");
    assert.notEqual(savedHash, newPassword); assert.equal(password.verifyPassword(newPassword, savedHash), true); assert.equal(password.verifyPassword(oldPassword, savedHash), false);
    assert.deepEqual(revoked, { userId: "u1", sessionId: "sa" });
  } finally { db.withTransaction = originalTransaction; }

  let captured;
  await withServer({ changePassword: async (token, input) => { captured = { token, input }; return { ok: true }; } }, async base => {
    let response = await fetch(base + "/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: "old", newPassword: "new-password", userId: "victim", role: "TEACHER", studentId: "other", schoolId: "other", passwordHash: "leak", status: "DISABLED" }) });
    const payload = await response.json(); assert.equal(response.status, 200); assert.equal(payload.password, undefined); assert.equal(payload.passwordHash, undefined); assert.equal(captured.token, undefined);
    assert.deepEqual(Object.keys(captured.input).sort(), ["currentPassword", "newPassword"]);
    response = await fetch(base + "/api/auth/password", { method: "POST", headers: { "content-type": "application/json", cookie: "yd_session=owned" }, body: JSON.stringify({ currentPassword: "old", newPassword: "new-password", userId: "victim" }) });
    assert.equal(response.status, 200); assert.equal(captured.token, "owned");
  });
  for (const [code, status, text] of [["UNAUTHENTICATED", 401, /Oturum/], ["INVALID_CREDENTIALS", 401, /Mevcut parola doğru değil/], ["INVALID_PASSWORD", 400, /en az 8/], ["PASSWORD_UNCHANGED", 400, /farklı olmalıdır/]]) {
    await withServer({ changePassword: async () => { const error = new Error(code); error.code = code; throw error; } }, async base => {
      const response = await fetch(base + "/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); const payload = await response.json();
      assert.equal(response.status, status); assert.equal(payload.error.code, code); assert.match(payload.error.message, text);
    });
  }
  console.log("PASS  password change current-password, shared policy, scrypt, same-password, session revocation, ownership, and safe route contract");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
