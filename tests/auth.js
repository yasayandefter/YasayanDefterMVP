"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { getConfig, publicConfig } = require("../auth/config");
const password = require("../auth/password");
const cookies = require("../auth/cookies");
const { validateAuthOrigin } = require("../auth/origin");
const sessions = require("../repositories/sessionRepository");
const claims = require("../repositories/claimRepository");
const users = require("../repositories/usersRepository");
const authService = require("../services/authService");
const db = require("../db");

const hash = password.hashPassword("correct horse battery");
assert.notEqual(hash, "correct horse battery");
assert.equal(password.verifyPassword("correct horse battery", hash), true);
assert.equal(password.verifyPassword("wrong password", hash), false);
assert.throws(() => password.validatePassword("short"), /INVALID_PASSWORD/);

const token = sessions.createToken();
assert.equal(token.length > 30, true);
assert.notEqual(sessions.hashToken(token), token);
assert.equal(sessions.hashToken(token), sessions.hashToken(token));
assert.notEqual(sessions.createToken(), token);

const local = getConfig({ AUTH_MODE: "local", STORAGE_MODE: "json", SESSION_TTL_SECONDS: "600" });
assert.equal(local.authMode, "local");
assert.equal(local.sessionTtlSeconds, 600);
assert.equal(local.cookieSecure, false);
assert.throws(() => getConfig({ AUTH_MODE: "production", STORAGE_MODE: "json" }), /AUTH_REQUIRES_POSTGRES/);
const prod = getConfig({ AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: "postgres://redacted", APP_ORIGIN: "https://app.example" });
assert.equal(prod.cookieSecure, true);
const vercelPublic = getConfig({ VERCEL: "1", AUTH_MODE: "production", STORAGE_MODE: "postgres" });
assert.equal(vercelPublic.accessMode, "public-demo");
assert.equal(vercelPublic.authMode, "local");
assert.equal(vercelPublic.database.storageMode, "json");
assert.throws(() => getConfig({ VERCEL: "1", ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres" }), /DATABASE_URL_REQUIRED/);
const vercelAuthenticated = getConfig({ VERCEL: "1", ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: "postgres://redacted", APP_ORIGIN: "https://app.example" });
assert.equal(vercelAuthenticated.authMode, "production");
assert.equal(publicConfig({ AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: "postgres://secret", APP_ORIGIN: "https://app.example" }).database, undefined);

const response = { setHeader(name, value) { this[name] = value; } };
cookies.setSessionCookie(response, "opaque-token", local);
assert.match(response["Set-Cookie"], /HttpOnly/);
assert.match(response["Set-Cookie"], /SameSite=Lax/);
assert.doesNotMatch(response["Set-Cookie"], /Secure/);
const secureResponse = { setHeader(name, value) { this[name] = value; } };
cookies.setSessionCookie(secureResponse, "opaque-token", prod);
assert.match(secureResponse["Set-Cookie"], /Secure/);
assert.equal(cookies.parseCookies("yd_session=abc%2B123; other=value").yd_session, "abc+123");

const request = { get(name) { return name === "origin" ? "https://app.example" : undefined; } };
assert.equal(validateAuthOrigin(request, prod), true);
assert.equal(validateAuthOrigin({ get: () => "https://evil.example" }, prod), false);

const fakeUser = { id: crypto.randomUUID(), role: "TEACHER", email: "teacher@example.test", status: "ACTIVE", password_hash: hash };
let createdToken;
const loginResult = authService.login("teacher@example.test", "correct horse battery", {
  config: local,
  users: { findByIdentifier: async () => fakeUser, safeUser: users.safeUser },
  sessions: { createSession: async () => ({ token: (createdToken = sessions.createToken()) }) }
});
loginResult.then(result => {
  assert.equal(result.user.role, "TEACHER");
  assert.equal(result.token, createdToken);
  return assert.rejects(() => authService.login("teacher@example.test", "wrong password", { config: local, users: { findByIdentifier: async () => fakeUser }, sessions: { createSession: async () => ({ token: "x" }) } }), error => error.code === "INVALID_CREDENTIALS");
}).then(async () => {
  const originalTransactionForRegister = db.withTransaction;
  db.withTransaction = async callback => callback({ marker: "register-client" });
  try {
    const registered = await authService.register({ username: "individual.user", email: "individual@example.test", rawPassword: "correct horse battery" }, {
      config: local,
      users: {
        findByUsername: async () => null,
        findByEmail: async () => null,
        createGeneralUser: async input => ({ id: input.id, role: "USER", username: input.username, email: input.email, status: "ACTIVE" })
      },
      sessions: { createSession: async () => ({ token: "individual-session-token" }) }
    });
    assert.equal(registered.user.role, "USER");
    assert.equal(registered.user.studentId, null);
    assert.equal(registered.token, "individual-session-token");
  } finally { db.withTransaction = originalTransactionForRegister; }
  const originalTransaction = db.withTransaction;
  db.withTransaction = async callback => callback({});
  try {
    await assert.rejects(() => authService.claimStudent({ claimCode: "abc", username: "", rawPassword: "correct horse battery" }), error => error.code === "CLAIM_INVALID");
  } finally {
    db.withTransaction = originalTransaction;
  }
  assert.equal(claims.hashClaim("ABC"), claims.hashClaim("ABC"));
  assert.equal(claims.hashClaim("ABC").includes("ABC"), false);
  assert.equal(users.email(" Teacher@Example.TEST "), "teacher@example.test");
  assert.equal(users.username(" Student One "), "student one");
  console.log("PASS  password, session, cookie, origin, config, auth service, claim, and normalization checks");
}).catch(error => { console.error(error); process.exitCode = 1; });
