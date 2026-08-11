"use strict";

const { getConfig } = require("../auth/config");
const { parseCookies } = require("../auth/cookies");
const sessions = require("../repositories/sessionRepository");

async function optionalAuth(req, res, next) {
  try {
    const config = getConfig();
    if (config.authMode !== "production") return next();
    const token = parseCookies(req.headers.cookie || "")[config.cookieName];
    if (!token) return next();
    const session = await sessions.findValidSession(token);
    if (session) { req.auth = { userId: session.user_id, role: session.role, studentId: session.student_id || null, sessionId: session.session_id }; await sessions.touchSession(session.session_id); }
    return next();
  } catch (_) { return next(); }
}

async function requireAuth(req, res, next) {
  await optionalAuth(req, res, () => {});
  if (!req.auth) return res.status(401).json({ ok: false, error: { code: "UNAUTHENTICATED", message: "Oturum açmanız gerekiyor." } });
  return next();
}

module.exports = { optionalAuth, requireAuth };
