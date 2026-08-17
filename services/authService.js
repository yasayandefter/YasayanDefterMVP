"use strict";

const crypto = require("node:crypto");
const { getConfig } = require("../auth/config");
const password = require("../auth/password");
const users = require("../repositories/usersRepository");
const sessions = require("../repositories/sessionRepository");
const claims = require("../repositories/claimRepository");
const passwordResets = require("../repositories/passwordResetRepository");
const notebookBackgrounds = require("../repositories/notebookBackgroundRepository");
const notebookBackground = require("../auth/notebookBackground");
const resetToken = require("../auth/resetToken");
const { getPasswordResetDelivery } = require("./passwordResetDelivery");
const db = require("../db");

const PASSWORD_RESET_TTL_SECONDS = 30 * 60;
const PASSWORD_RESET_REQUEST_MESSAGE = "Eğer bu bilgilerle eşleşen bir hesap varsa parola sıfırlama adımı hazırlanmıştır.";

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

async function updatePreferences(token, input, dependencies = {}) {
  const userRepository = dependencies.users || users;
  const sessionRepository = dependencies.sessions || sessions;
  const activeSession = await sessionRepository.findValidSession(token);
  if (!activeSession) throw authError("UNAUTHENTICATED");
  let updated;
  try { updated = await userRepository.updatePreferences(activeSession.user_id, { theme: input?.theme, notebookWritingStyle: input?.notebookWritingStyle, notebookPageStyle: input?.notebookPageStyle }); }
  catch (error) { throw authError(error.code || error.message); }
  if (!updated) throw authError("UNAUTHENTICATED");
  return { user: publicUser({ ...updated, student_id: activeSession.student_id }) };
}

async function getNotebookBackground(token, dependencies = {}) {
  const activeSession = await (dependencies.sessions || sessions).findValidSession(token);
  if (!activeSession) throw authError("UNAUTHENTICATED");
  return (dependencies.notebookBackgrounds || notebookBackgrounds).findByUserId(activeSession.user_id);
}

async function updateNotebookBackground(token, input, dependencies = {}) {
  const activeSession = await (dependencies.sessions || sessions).findValidSession(token);
  if (!activeSession) throw authError("UNAUTHENTICATED");
  let validated;
  try { validated = notebookBackground.validate(input); } catch (error) { throw authError(error.code || error.message); }
  return (dependencies.notebookBackgrounds || notebookBackgrounds).upsert(activeSession.user_id, validated);
}

async function removeNotebookBackground(token, dependencies = {}) {
  const activeSession = await (dependencies.sessions || sessions).findValidSession(token);
  if (!activeSession) throw authError("UNAUTHENTICATED");
  await (dependencies.notebookBackgrounds || notebookBackgrounds).remove(activeSession.user_id);
  return { ok: true };
}

async function updateProfile(token, input, dependencies = {}) {
  const userRepository = dependencies.users || users;
  const sessionRepository = dependencies.sessions || sessions;
  const activeSession = await sessionRepository.findValidSession(token);
  if (!activeSession) throw authError("UNAUTHENTICATED");
  const current = await userRepository.findById(activeSession.user_id);
  if (!current || !password.verifyPassword(input?.currentPassword, current.password_hash || "")) throw authError("INVALID_CREDENTIALS");
  let normalizedUsername; let normalizedEmail; let normalizedDisplayName;
  try {
    normalizedUsername = input?.username === undefined ? current.username : users.validateUsername(input.username);
    normalizedEmail = input?.email === undefined ? current.email : input.email === null || String(input.email || "").trim() === "" ? null : users.validateEmail(input.email);
    normalizedDisplayName = input?.displayName === undefined ? users.displayName(current.display_name) : users.displayName(input.displayName);
  } catch (error) { throw authError(error.message); }
  try {
    return await db.withTransaction(async client => {
      const usernameOwner = await userRepository.findByUsername(normalizedUsername, client);
      if (usernameOwner && usernameOwner.id !== current.id) throw authError("USERNAME_TAKEN");
      if (normalizedEmail) {
        const emailOwner = await userRepository.findByEmail(normalizedEmail, client);
        if (emailOwner && emailOwner.id !== current.id) throw authError("EMAIL_TAKEN");
      }
      const updated = await userRepository.updateAccountProfile(current.id, { username: normalizedUsername, email: normalizedEmail, displayName: normalizedDisplayName }, client);
      return { user: publicUser({ ...updated, student_id: current.student_id }) };
    });
  } catch (error) {
    if (error.code === "23505") throw authError(String(error.constraint || "").includes("email") ? "EMAIL_TAKEN" : "USERNAME_TAKEN");
    throw error;
  }
}

async function changePassword(token, input, dependencies = {}) {
  const userRepository = dependencies.users || users;
  const sessionRepository = dependencies.sessions || sessions;
  const activeSession = await sessionRepository.findValidSession(token);
  if (!activeSession) throw authError("UNAUTHENTICATED");
  const current = await userRepository.findById(activeSession.user_id);
  if (!current || !password.verifyPassword(input?.currentPassword, current.password_hash || current.passwordHash || "")) throw authError("INVALID_CREDENTIALS");
  try { password.validatePassword(input?.newPassword); }
  catch (error) { throw authError(error.message); }
  if (password.verifyPassword(input.newPassword, current.password_hash || current.passwordHash || "")) throw authError("PASSWORD_UNCHANGED");
  const nextHash = password.hashPassword(input.newPassword);
  await db.withTransaction(async client => {
    await userRepository.updatePasswordHash(current.id, nextHash, client);
    await sessionRepository.revokeOtherUserSessions(current.id, activeSession.session_id, client);
  });
  return { ok: true, user: publicUser(current) };
}

async function requestPasswordReset(identifier, dependencies = {}) {
  const userRepository = dependencies.users || users;
  const resetRepository = dependencies.passwordResets || passwordResets;
  const delivery = dependencies.delivery || getPasswordResetDelivery();
  const rawToken = resetToken.createToken();
  try {
    const user = await userRepository.findByIdentifier(identifier);
    if (!user || String(user.status || "").toUpperCase() === "DISABLED" || !delivery.available || (delivery.requiresEmail && !user.email)) return { ok: true, message: PASSWORD_RESET_REQUEST_MESSAGE };
    const ttlSeconds = dependencies.ttlSeconds || PASSWORD_RESET_TTL_SECONDS;
    await db.withTransaction(async client => {
      await resetRepository.cleanup(100, client);
      await resetRepository.invalidateUnusedForUser(user.id, client);
      await resetRepository.create(user.id, rawToken, ttlSeconds, client);
    });
    await delivery.deliver({ userId: user.id, email: user.email || null, username: user.username || null, token: rawToken, expiresInSeconds: ttlSeconds });
  } catch (_) { /* public response must remain enumeration-safe */ }
  return { ok: true, message: PASSWORD_RESET_REQUEST_MESSAGE };
}

async function completePasswordReset(input, dependencies = {}) {
  const userRepository = dependencies.users || users;
  const sessionRepository = dependencies.sessions || sessions;
  const resetRepository = dependencies.passwordResets || passwordResets;
  try { password.validatePassword(input?.newPassword); }
  catch (error) { throw authError(error.message); }
  if (!input?.token) throw authError("RESET_TOKEN_INVALID");
  return db.withTransaction(async client => {
    const tokenRow = await resetRepository.findValidForUpdate(input.token, client);
    if (!tokenRow) throw authError("RESET_TOKEN_INVALID");
    const user = await userRepository.findById(tokenRow.user_id, client);
    if (!user || String(user.status || "").toUpperCase() === "DISABLED") throw authError("RESET_TOKEN_INVALID");
    await userRepository.updatePasswordHash(user.id, password.hashPassword(input.newPassword), client);
    await resetRepository.markUsed(tokenRow.id, client);
    await sessionRepository.revokeAllUserSessions(user.id, client);
    return { ok: true };
  });
}

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

module.exports = { PASSWORD_RESET_TTL_SECONDS, PASSWORD_RESET_REQUEST_MESSAGE, authError, login, register, logout, session, updateProfile, updatePreferences, getNotebookBackground, updateNotebookBackground, removeNotebookBackground, changePassword, requestPasswordReset, completePasswordReset, claimStudent };
