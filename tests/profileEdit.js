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
  const app = express(); app.use(express.json());
  app.use("/api/auth", createAuthRouter({ authService: service, getConfig: () => ({ authMode: "production", cookieName: "yd_session", cookieSecure: false, cookieSameSite: "Lax" }), validateAuthOrigin: () => true }));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); }
}

async function run() {
  const originalTransaction = db.withTransaction;
  const hash = password.hashPassword("correct horse battery");
  const current = { id: "u1", role: "STUDENT", username: "old.user", email: "old@example.test", display_name: "Old Name", password_hash: hash, status: "ACTIVE", student_id: "student-1" };
  let saved;
  const repository = {
    safeUser: users.safeUser,
    findById: async () => current,
    findByUsername: async value => value === "taken.user" ? { id: "u2" } : value === "old.user" ? current : null,
    findByEmail: async value => value === "taken@example.test" ? { id: "u2" } : value === "old@example.test" ? current : null,
    updateAccountProfile: async (_id, input) => (saved = { ...current, username: input.username, email: input.email, display_name: input.displayName })
  };
  const sessions = { findValidSession: async token => token === "valid" ? { user_id: "u1" } : null };
  db.withTransaction = async callback => callback({ transaction: true });
  try {
    await assert.rejects(() => authService.updateProfile(null, {}, { users: repository, sessions }), error => error.code === "UNAUTHENTICATED");
    await assert.rejects(() => authService.updateProfile("valid", { username: "new.user", email: "new@example.test", displayName: "New Name", currentPassword: "wrong password" }, { users: repository, sessions }), error => error.code === "INVALID_CREDENTIALS");
    await assert.rejects(() => authService.updateProfile("valid", { username: "taken.user", email: "new@example.test", displayName: "New", currentPassword: "correct horse battery" }, { users: repository, sessions }), error => error.code === "USERNAME_TAKEN");
    await assert.rejects(() => authService.updateProfile("valid", { username: "new.user", email: "taken@example.test", displayName: "New", currentPassword: "correct horse battery" }, { users: repository, sessions }), error => error.code === "EMAIL_TAKEN");
    const result = await authService.updateProfile("valid", { username: " New.User ", email: " NEW@Example.TEST ", displayName: "  New   Name ", currentPassword: "correct horse battery", role: "TEACHER", userId: "u2", studentId: "student-2" }, { users: repository, sessions });
    assert.deepEqual(saved.username, "new.user"); assert.deepEqual(saved.email, "new@example.test"); assert.deepEqual(saved.display_name, "New Name");
    assert.equal(result.user.id, "u1"); assert.equal(result.user.role, "STUDENT"); assert.equal(result.user.studentId, "student-1");
    const cleared = await authService.updateProfile("valid", { username: "old.user", email: "", displayName: "", currentPassword: "correct horse battery" }, { users: repository, sessions });
    assert.equal(cleared.user.email, null);
  } finally { db.withTransaction = originalTransaction; }

  let captured;
  await withServer({ updateProfile: async (token, input) => { captured = { token, input }; return { user: { id: "u1", role: "USER", username: input.username } }; } }, async base => {
    let response = await fetch(base + "/api/auth/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "x", currentPassword: "secret" }) });
    assert.equal(response.status, 200); assert.equal(captured.token, undefined);
    response = await fetch(base + "/api/auth/profile", { method: "PATCH", headers: { "content-type": "application/json", cookie: "yd_session=owned" }, body: JSON.stringify({ username: "mine", email: "mine@example.test", displayName: "Mine", currentPassword: "secret", userId: "victim", role: "TEACHER", studentId: "other", schoolId: "school", password: "replacement" }) });
    assert.equal(response.status, 200); assert.equal(captured.token, "owned");
    assert.deepEqual(Object.keys(captured.input).sort(), ["currentPassword", "displayName", "email", "username"]);
  });
  await withServer({ updateProfile: async () => { const error = new Error("UNAUTHENTICATED"); error.code = "UNAUTHENTICATED"; throw error; } }, async base => {
    const response = await fetch(base + "/api/auth/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" }); assert.equal(response.status, 401);
  });
  console.log("PASS  profile edit ownership, password, validation, normalization, conflicts, email removal, linkage, and mass assignment");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
