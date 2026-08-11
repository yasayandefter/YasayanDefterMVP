"use strict";

function parseCookies(header = "") {
  const output = {};
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { output[key] = decodeURIComponent(value); } catch (_) { output[key] = ""; }
  }
  return output;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || "/"}`, `SameSite=${options.sameSite || "Lax"}`];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join("; ");
}

function setSessionCookie(res, token, config) { res.setHeader("Set-Cookie", serializeCookie(config.cookieName, token, { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, maxAge: config.sessionTtlSeconds })); }
function clearSessionCookie(res, config) { res.setHeader("Set-Cookie", serializeCookie(config.cookieName, "", { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, maxAge: 0 })); }

module.exports = { parseCookies, serializeCookie, setSessionCookie, clearSessionCookie };
