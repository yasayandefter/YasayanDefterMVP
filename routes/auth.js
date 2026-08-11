"use strict";

const express = require("express");
const { getConfig } = require("../auth/config");
const { parseCookies, setSessionCookie, clearSessionCookie } = require("../auth/cookies");
const { validateAuthOrigin } = require("../auth/origin");
const authService = require("../services/authService");

const router = express.Router();
function enabled(res) { const config = getConfig(); if (config.authMode === "production") return config; res.status(404).json({ ok: false, error: { code: "AUTH_DISABLED", message: "Bu pilot modunda kimlik doğrulama etkin değil." } }); return null; }
function safeAuthError(error) { const allowed = new Set(["INVALID_CREDENTIALS", "ACCOUNT_DISABLED", "CLAIM_INVALID", "CLAIM_EXPIRED", "CLAIM_USED", "CLAIM_LOCKED", "USERNAME_TAKEN", "INVALID_PASSWORD"]); return allowed.has(error.code || error.message) ? (error.code || error.message) : "AUTH_FAILED"; }
function authMessage(code) { return ({ INVALID_CREDENTIALS: "Kimlik bilgileri geçersiz.", ACCOUNT_DISABLED: "Hesap devre dışı.", CLAIM_INVALID: "Claim kodu geçersiz.", CLAIM_EXPIRED: "Claim kodunun süresi dolmuş.", CLAIM_USED: "Claim kodu daha önce kullanılmış.", CLAIM_LOCKED: "Claim kodu geçici olarak kilitlendi.", USERNAME_TAKEN: "Kullanıcı adı kullanılıyor.", INVALID_PASSWORD: "Parola kurallara uygun değil.", AUTH_FAILED: "Kimlik doğrulama tamamlanamadı." })[code] || "Kimlik doğrulama tamamlanamadı."; }
function originGuard(req, res) { if (validateAuthOrigin(req, getConfig())) return true; res.status(403).json({ ok: false, error: { code: "CSRF_ORIGIN_REJECTED", message: "İstek kaynağına izin verilmiyor." } }); return false; }

router.post("/login", async (req, res) => {
  const config = enabled(res); if (!config || !originGuard(req, res)) return;
  try { const result = await authService.login(req.body?.identifier, req.body?.password, { config }); setSessionCookie(res, result.token, config); return res.json({ ok: true, user: result.user }); }
  catch (error) { const code = safeAuthError(error); return res.status(code === "AUTH_FAILED" ? 500 : 401).json({ ok: false, error: { code, message: authMessage(code) } }); }
});

router.post("/logout", async (req, res) => {
  const config = enabled(res); if (!config || !originGuard(req, res)) return;
  try { const token = parseCookies(req.headers.cookie || "")[config.cookieName]; await authService.logout(token); clearSessionCookie(res, config); return res.json({ ok: true }); }
  catch (_) { clearSessionCookie(res, config); return res.json({ ok: true }); }
});

router.get("/session", async (req, res) => {
  const config = enabled(res); if (!config) return;
  try { const token = parseCookies(req.headers.cookie || "")[config.cookieName]; return res.json({ ok: true, ...(await authService.session(token)) }); }
  catch (_) { return res.json({ ok: true, authenticated: false }); }
});

router.post("/claim", async (req, res) => {
  const config = enabled(res); if (!config || !originGuard(req, res)) return;
  try { const result = await authService.claimStudent({ claimCode: req.body?.claimCode, username: req.body?.username, rawPassword: req.body?.password }, { config }); setSessionCookie(res, result.token, config); return res.status(201).json({ ok: true, user: result.user }); }
  catch (error) { const code = safeAuthError(error); return res.status(code === "AUTH_FAILED" ? 500 : 400).json({ ok: false, error: { code, message: authMessage(code) } }); }
});

module.exports = router;
