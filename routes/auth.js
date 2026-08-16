"use strict";

const express = require("express");
const { getConfig } = require("../auth/config");
const { parseCookies, setSessionCookie, clearSessionCookie } = require("../auth/cookies");
const { validateAuthOrigin } = require("../auth/origin");
const authService = require("../services/authService");
const { authRateLimiter, rejectRateLimited } = require("../middleware/authRateLimit");

function createAuthRouter(dependencies = {}) {
const router = express.Router();
const service = dependencies.authService || authService;
const limiter = dependencies.limiter || authRateLimiter;
const configProvider = dependencies.getConfig || getConfig;
const originValidator = dependencies.validateAuthOrigin || validateAuthOrigin;
function safeAuthError(error) { const allowed = new Set(["UNAUTHENTICATED", "INVALID_CREDENTIALS", "ACCOUNT_DISABLED", "CLAIM_INVALID", "CLAIM_EXPIRED", "CLAIM_USED", "CLAIM_LOCKED", "USERNAME_TAKEN", "EMAIL_TAKEN", "INVALID_USERNAME", "INVALID_EMAIL", "INVALID_PASSWORD"]); return allowed.has(error.code || error.message) ? (error.code || error.message) : "AUTH_FAILED"; }
function profileMessage(code) { return ({ UNAUTHENTICATED: "Oturum açmanız gerekiyor.", INVALID_CREDENTIALS: "Mevcut parola yanlış.", USERNAME_TAKEN: "Bu kullanıcı adı zaten kullanılıyor.", EMAIL_TAKEN: "Bu e-posta adresi zaten kullanılıyor.", INVALID_USERNAME: "Kullanıcı adı geçersiz.", INVALID_EMAIL: "E-posta adresi geçersiz.", AUTH_FAILED: "Profil güncellenemedi." })[code] || authMessage(code); }
function authMessage(code) { return ({ INVALID_CREDENTIALS: "Kimlik bilgileri geçersiz.", ACCOUNT_DISABLED: "Hesap devre dışı.", CLAIM_INVALID: "Davet kodu geçersiz.", CLAIM_EXPIRED: "Davet kodunun süresi dolmuş.", CLAIM_USED: "Davet kodu daha önce kullanılmış.", CLAIM_LOCKED: "Davet kodu geçici olarak kilitlendi.", USERNAME_TAKEN: "Kullanıcı adı kullanılıyor.", EMAIL_TAKEN: "E-posta adresi kullanılıyor.", INVALID_USERNAME: "Kullanıcı adı geçersiz.", INVALID_EMAIL: "E-posta adresi geçersiz.", INVALID_PASSWORD: "Parola kurallara uygun değil.", AUTH_FAILED: "Kimlik doğrulama tamamlanamadı." })[code] || "Kimlik doğrulama tamamlanamadı."; }
function enabledForRequest(res) { const config = configProvider(); if (config.authMode === "production") return config; res.status(404).json({ ok: false, error: { code: "AUTH_DISABLED", message: "Bu pilot modunda kimlik doğrulama etkin değil." } }); return null; }
function originGuard(req, res) { if (originValidator(req, configProvider())) return true; res.status(403).json({ ok: false, error: { code: "CSRF_ORIGIN_REJECTED", message: "İstek kaynağına izin verilmiyor." } }); return false; }
function consume(bucket, req, res) { const result = limiter.consume(bucket, req); return result.allowed ? true : (rejectRateLimited(res, result.retryAfter), false); }

router.post("/login", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res) || !consume("LOGIN", req, res)) return;
  try { const result = await service.login(req.body?.identifier, req.body?.password, { config }); limiter.reset("LOGIN", req); setSessionCookie(res, result.token, config); return res.json({ ok: true, user: result.user }); }
  catch (error) { const code = safeAuthError(error); return res.status(code === "AUTH_FAILED" ? 500 : 401).json({ ok: false, error: { code, message: authMessage(code) } }); }
});

router.post("/register", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res) || !consume("REGISTER", req, res)) return;
  try { const result = await service.register({ username: req.body?.username, email: req.body?.email, rawPassword: req.body?.password }, { config }); setSessionCookie(res, result.token, config); return res.status(201).json({ ok: true, user: result.user }); }
  catch (error) { const code = safeAuthError(error); const status = ["USERNAME_TAKEN", "EMAIL_TAKEN"].includes(code) ? 409 : code === "AUTH_FAILED" ? 500 : 400; return res.status(status).json({ ok: false, error: { code, message: authMessage(code) } }); }
});

router.post("/logout", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res)) return;
  try { const token = parseCookies(req.headers.cookie || "")[config.cookieName]; await service.logout(token); clearSessionCookie(res, config); return res.json({ ok: true }); }
  catch (_) { clearSessionCookie(res, config); return res.json({ ok: true }); }
});

router.get("/session", async (req, res) => {
  const rawConfig = configProvider();
  if (rawConfig.authMode !== "production" && rawConfig.accessMode === "public-demo") return res.json({ ok: true, authenticated: false, accessMode: "public-demo" });
  const config = enabledForRequest(res); if (!config) return;
  try { const token = parseCookies(req.headers.cookie || "")[config.cookieName]; return res.json({ ok: true, ...(await service.session(token)) }); }
  catch (_) { return res.json({ ok: true, authenticated: false }); }
});

router.patch("/profile", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res)) return;
  try {
    const token = parseCookies(req.headers.cookie || "")[config.cookieName];
    const result = await service.updateProfile(token, { username: req.body?.username, email: req.body?.email, displayName: req.body?.displayName, currentPassword: req.body?.currentPassword });
    return res.json({ ok: true, user: result.user });
  } catch (error) {
    const code = safeAuthError(error);
    const status = code === "UNAUTHENTICATED" || code === "INVALID_CREDENTIALS" ? 401 : ["USERNAME_TAKEN", "EMAIL_TAKEN"].includes(code) ? 409 : code === "AUTH_FAILED" ? 500 : 400;
    return res.status(status).json({ ok: false, error: { code, message: profileMessage(code) } });
  }
});

router.post("/claim", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res) || !consume("CLAIM", req, res)) return;
  try { const result = await service.claimStudent({ claimCode: req.body?.claimCode, username: req.body?.username, rawPassword: req.body?.password }, { config }); setSessionCookie(res, result.token, config); return res.status(201).json({ ok: true, user: result.user }); }
  catch (error) { const code = safeAuthError(error); return res.status(code === "AUTH_FAILED" ? 500 : 400).json({ ok: false, error: { code, message: authMessage(code) } }); }
});

return router;
}

module.exports = createAuthRouter();
module.exports.createAuthRouter = createAuthRouter;
