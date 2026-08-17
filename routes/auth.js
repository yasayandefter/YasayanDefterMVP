"use strict";

const express = require("express");
const { getConfig } = require("../auth/config");
const { parseCookies, setSessionCookie, clearSessionCookie } = require("../auth/cookies");
const { validateAuthOrigin } = require("../auth/origin");
const authService = require("../services/authService");
const { authRateLimiter, rejectRateLimited } = require("../middleware/authRateLimit");
const { MAX_BACKGROUND_BYTES, CONTENT_TYPES } = require("../auth/notebookBackground");

function createAuthRouter(dependencies = {}) {
const router = express.Router();
const service = dependencies.authService || authService;
const limiter = dependencies.limiter || authRateLimiter;
const configProvider = dependencies.getConfig || getConfig;
const originValidator = dependencies.validateAuthOrigin || validateAuthOrigin;
function safeAuthError(error) { const allowed = new Set(["UNAUTHENTICATED", "INVALID_CREDENTIALS", "ACCOUNT_DISABLED", "CLAIM_INVALID", "CLAIM_EXPIRED", "CLAIM_USED", "CLAIM_LOCKED", "USERNAME_TAKEN", "EMAIL_TAKEN", "INVALID_USERNAME", "INVALID_EMAIL", "INVALID_PASSWORD", "PASSWORD_UNCHANGED", "RESET_TOKEN_INVALID", "INVALID_PREFERENCES", "INVALID_BACKGROUND_IMAGE", "INVALID_BACKGROUND_SETTINGS"]); return allowed.has(error.code || error.message) ? (error.code || error.message) : "AUTH_FAILED"; }
function profileMessage(code) { return ({ UNAUTHENTICATED: "Oturum açmanız gerekiyor.", INVALID_CREDENTIALS: "Mevcut parola yanlış.", USERNAME_TAKEN: "Bu kullanıcı adı zaten kullanılıyor.", EMAIL_TAKEN: "Bu e-posta adresi zaten kullanılıyor.", INVALID_USERNAME: "Kullanıcı adı geçersiz.", INVALID_EMAIL: "E-posta adresi geçersiz.", AUTH_FAILED: "Profil güncellenemedi." })[code] || authMessage(code); }
function authMessage(code) { return ({ INVALID_CREDENTIALS: "Kimlik bilgileri geçersiz.", ACCOUNT_DISABLED: "Hesap devre dışı.", CLAIM_INVALID: "Davet kodu geçersiz.", CLAIM_EXPIRED: "Davet kodunun süresi dolmuş.", CLAIM_USED: "Davet kodu daha önce kullanılmış.", CLAIM_LOCKED: "Davet kodu geçici olarak kilitlendi.", USERNAME_TAKEN: "Kullanıcı adı kullanılıyor.", EMAIL_TAKEN: "E-posta adresi kullanılıyor.", INVALID_USERNAME: "Kullanıcı adı geçersiz.", INVALID_EMAIL: "E-posta adresi geçersiz.", INVALID_PASSWORD: "Parola kurallara uygun değil.", AUTH_FAILED: "Kimlik doğrulama tamamlanamadı." })[code] || "Kimlik doğrulama tamamlanamadı."; }
function passwordMessage(code) { return ({ UNAUTHENTICATED: "Oturum açmanız gerekiyor.", INVALID_CREDENTIALS: "Mevcut parola doğru değil.", INVALID_PASSWORD: "Yeni parola en az 8, en fazla 128 karakter olmalıdır.", PASSWORD_UNCHANGED: "Yeni parola mevcut parolanızdan farklı olmalıdır.", AUTH_FAILED: "Parola değiştirilemedi." })[code] || "Parola değiştirilemedi."; }
function resetMessage(code) { return ({ INVALID_PASSWORD: "Yeni parola en az 8, en fazla 128 karakter olmalıdır.", RESET_TOKEN_INVALID: "Parola sıfırlama bağlantısı geçersiz veya süresi dolmuş.", AUTH_FAILED: "Parola sıfırlanamadı." })[code] || "Parola sıfırlanamadı."; }
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

router.patch("/preferences", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res)) return;
  try {
    const token = parseCookies(req.headers.cookie || "")[config.cookieName];
    const result = await service.updatePreferences(token, { theme: req.body?.theme, notebookWritingStyle: req.body?.notebookWritingStyle, notebookPageStyle: req.body?.notebookPageStyle });
    return res.json({ ok: true, preferences: result.user.preferences, user: result.user });
  } catch (error) {
    const code = safeAuthError(error);
    const status = code === "UNAUTHENTICATED" ? 401 : code === "AUTH_FAILED" ? 500 : 400;
    const message = code === "INVALID_PREFERENCES" ? "Görünüm tercihi geçersiz." : code === "UNAUTHENTICATED" ? "Oturum açmanız gerekiyor." : "Görünüm tercihi kaydedilemedi.";
    return res.status(status).json({ ok: false, error: { code, message } });
  }
});

function backgroundMessage(code) {
  return ({ UNAUTHENTICATED: "Oturum açmanız gerekiyor.", INVALID_BACKGROUND_IMAGE: "Fotoğraf geçersiz veya izin verilen boyutu aşıyor.", INVALID_BACKGROUND_SETTINGS: "Arka plan ayarları geçersiz.", AUTH_FAILED: "Defter arka planı kaydedilemedi." })[code] || "Defter arka planı kaydedilemedi.";
}
router.get("/notebook-background", async (req, res) => {
  const config = enabledForRequest(res); if (!config) return;
  try {
    const token = parseCookies(req.headers.cookie || "")[config.cookieName];
    const row = await service.getNotebookBackground(token, { notebookBackgrounds: dependencies.notebookBackgroundRepository });
    if (!row) return res.status(204).end();
    res.setHeader("Content-Type", row.content_type);
    res.setHeader("Content-Length", String(row.byte_size));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Notebook-Position", row.position);
    res.setHeader("X-Notebook-Overlay", String(row.overlay));
    res.setHeader("X-Notebook-Blur", String(row.blur));
    return res.end(row.image_data);
  } catch (error) {
    const code = safeAuthError(error); return res.status(code === "UNAUTHENTICATED" ? 401 : 500).json({ ok: false, error: { code, message: backgroundMessage(code) } });
  }
});
router.put("/notebook-background", express.raw({ type: CONTENT_TYPES, limit: MAX_BACKGROUND_BYTES + "b" }), async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res)) return;
  try {
    const token = parseCookies(req.headers.cookie || "")[config.cookieName];
    const result = await service.updateNotebookBackground(token, { data: req.body, contentType: req.headers["content-type"], position: req.headers["x-notebook-position"], overlay: req.headers["x-notebook-overlay"], blur: req.headers["x-notebook-blur"] }, { notebookBackgrounds: dependencies.notebookBackgroundRepository });
    return res.json({ ok: true, background: { contentType: result.content_type, byteSize: result.byte_size, position: result.position, overlay: result.overlay, blur: result.blur } });
  } catch (error) {
    const code = safeAuthError(error); const status = code === "UNAUTHENTICATED" ? 401 : code === "AUTH_FAILED" ? 500 : 400;
    return res.status(status).json({ ok: false, error: { code, message: backgroundMessage(code) } });
  }
});
router.delete("/notebook-background", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res)) return;
  try { const token = parseCookies(req.headers.cookie || "")[config.cookieName]; await service.removeNotebookBackground(token, { notebookBackgrounds: dependencies.notebookBackgroundRepository }); return res.json({ ok: true }); }
  catch (error) { const code = safeAuthError(error); return res.status(code === "UNAUTHENTICATED" ? 401 : 500).json({ ok: false, error: { code, message: backgroundMessage(code) } }); }
});

router.post("/password", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res) || !consume("PASSWORD_CHANGE", req, res)) return;
  try {
    const token = parseCookies(req.headers.cookie || "")[config.cookieName];
    await service.changePassword(token, { currentPassword: req.body?.currentPassword, newPassword: req.body?.newPassword });
    limiter.reset("PASSWORD_CHANGE", req);
    return res.json({ ok: true, message: "Parolanız başarıyla değiştirildi." });
  } catch (error) {
    const code = safeAuthError(error);
    const status = code === "UNAUTHENTICATED" || code === "INVALID_CREDENTIALS" ? 401 : code === "AUTH_FAILED" ? 500 : 400;
    return res.status(status).json({ ok: false, error: { code, message: passwordMessage(code) } });
  }
});

router.post("/password-reset/request", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res) || !consume("PASSWORD_RESET_REQUEST", req, res)) return;
  try { const result = await service.requestPasswordReset(req.body?.identifier, { delivery: dependencies.passwordResetDelivery, passwordResets: dependencies.passwordResetRepository }); return res.json({ ok: true, message: result.message }); }
  catch (_) { return res.json({ ok: true, message: service.PASSWORD_RESET_REQUEST_MESSAGE || authService.PASSWORD_RESET_REQUEST_MESSAGE }); }
});

router.post("/password-reset/complete", async (req, res) => {
  const config = enabledForRequest(res); if (!config || !originGuard(req, res) || !consume("PASSWORD_RESET_COMPLETE", req, res)) return;
  try {
    await service.completePasswordReset({ token: req.body?.token, newPassword: req.body?.newPassword }, { passwordResets: dependencies.passwordResetRepository });
    limiter.reset("PASSWORD_RESET_COMPLETE", req);
    clearSessionCookie(res, config);
    return res.json({ ok: true, message: "Parolanız başarıyla sıfırlandı. Yeni parolanızla giriş yapabilirsiniz." });
  } catch (error) {
    const code = safeAuthError(error); const status = code === "AUTH_FAILED" ? 500 : 400;
    return res.status(status).json({ ok: false, error: { code, message: resetMessage(code) } });
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
