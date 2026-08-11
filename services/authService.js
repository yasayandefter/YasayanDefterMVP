"use strict";

const crypto = require("node:crypto");
const { getConfig } = require("../auth/config");
const password = require("../auth/password");
const users = require("../repositories/usersRepository");
const sessions = require("../repositories/sessionRepository");
const claims = require("../repositories/claimRepository");
const db = require("../db");

function authError(code) { const error = new Error(code); error.code = code; return error; }
function publicUser(row) { return users.safeUser(row); }

async function login(identifier, rawPassword, dependencies = {}) {
  const userRepository = dependencies.users || users;
  const sessionRepository = dependencies.sessions || sessions;
  const config = dependencies.config || getConfig();
  const user = await userRepository.findByIdentifier(identifier);
  if (!user || String(user.status || "").toUpperCase() === "DISABLED") throw authError(user ? "ACCOUNT_DISABLED" : "INVALID_CREDENTIALS");
  if (!password.verifyPassword(rawPassword, user.password_hash || user.passwordHash || "")) throw authError("INVALID_CREDENTIALS");
  const created = await sessionRepository.createSession(user.id, config.sessionTtlSeconds);
  return { token: created.token, user: publicUser(user) };
}

async function logout(token, dependencies = {}) { const sessionRepository = dependencies.sessions || sessions; await sessionRepository.revokeSession(token); return { ok: true }; }
async function session(token, dependencies = {}) { const sessionRepository = dependencies.sessions || sessions; const row = await sessionRepository.findValidSession(token); return row ? { authenticated: true, user: publicUser(row) } : { authenticated: false }; }

async function register({ username, email, rawPassword }, dependencies = {}) {
  const userRepository = dependencies.users || users;
  const sessionRepository = dependencies.sessions || sessions;
  const config = dependencies.config || getConfig();
  let normalizedUsername;
  try { normalizedUsername = users.validateUsername(username); if (email) users.validateEmail(email); password.validatePassword(rawPassword); }
  catch (error) { throw authError(error.message); }
  return db.withTransaction(async client => {
    if (await userRepository.findByUsername(normalizedUsername, client)) throw authError("USERNAME_TAKEN");
    if (email && await userRepository.findByEmail(email, client)) throw authError("EMAIL_TAKEN");
    const user = await userRepository.createGeneralUser({ id: crypto.randomUUID(), username: normalizedUsername, email, passwordHash: password.hashPassword(rawPassword) }, client);
    const created = await sessionRepository.createSession(user.id, config.sessionTtlSeconds, client);
    return { token: created.token, user: publicUser(user) };
  });
}

async function claimStudent({ claimCode, username, rawPassword }, dependencies = {}) {
  const userRepository = dependencies.users || users;
  const claimRepository = dependencies.claims || claims;
  const sessionRepository = dependencies.sessions || sessions;
  const config = dependencies.config || getConfig();
  if (!claimCode) throw authError("CLAIM_INVALID");
  try { users.validateUsername(username); } catch (_) { throw authError("CLAIM_INVALID"); }
  password.validatePassword(rawPassword);
  return db.withTransaction(async client => {
    const claim = await claimRepository.findForUpdate(claimCode, client);
    if (!claim) throw authError("CLAIM_INVALID");
    if (claim.used_at) throw authError("CLAIM_USED");
    if (claim.locked_until && new Date(claim.locked_until) > new Date()) throw authError("CLAIM_LOCKED");
    if (new Date(claim.expires_at) <= new Date()) throw authError("CLAIM_EXPIRED");
    if (await userRepository.findByUsername(username, client)) { await claimRepository.recordFailure(claim.id, client); throw authError("USERNAME_TAKEN"); }
    const user = await userRepository.createStudentUser({ id: crypto.randomUUID(), username, passwordHash: password.hashPassword(rawPassword) }, client);
    const linked = await userRepository.linkStudentUser(claim.student_id, user.id, client);
    if (!linked) throw authError("CLAIM_INVALID");
    await claimRepository.markUsed(claim.id, user.id, client);
    const created = await sessionRepository.createSession(user.id, config.sessionTtlSeconds, client);
    return { token: created.token, user: publicUser({ ...user, student_id: claim.student_id }) };
  });
}

module.exports = { authError, login, register, logout, session, claimStudent };
