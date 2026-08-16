"use strict";

const crypto = require("node:crypto");

const POLICIES = Object.freeze({
  LOGIN: Object.freeze({ limit: 10, windowMs: 15 * 60 * 1000 }),
  PASSWORD_CHANGE: Object.freeze({ limit: 5, windowMs: 15 * 60 * 1000 }),
  REGISTER: Object.freeze({ limit: 5, windowMs: 60 * 60 * 1000 }),
  CLAIM: Object.freeze({ limit: 6, windowMs: 15 * 60 * 1000 })
});

const RATE_LIMIT_MESSAGE = "Çok fazla deneme yapıldı. Lütfen kısa süre sonra tekrar deneyin.";

function requestIdentity(req) {
  // Express keeps trust proxy disabled in this application. Consequently req.ip
  // is derived from the direct peer, not from an untrusted X-Forwarded-For value.
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function hashedIdentity(req) {
  return crypto.createHash("sha256").update(requestIdentity(req)).digest("hex");
}

class AuthRateLimiter {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.maxEntries = Math.max(1, Number(options.maxEntries) || 10000);
    this.policies = options.policies || POLICIES;
    this.entries = new Map();
  }

  cleanup(now = this.now()) {
    for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key);
  }

  makeKey(bucket, req) { return `${bucket}:${hashedIdentity(req)}`; }

  consume(bucket, req) {
    const policy = this.policies[bucket];
    if (!policy) throw new Error("RATE_LIMIT_POLICY_UNKNOWN");
    const now = this.now();
    this.cleanup(now);
    const key = this.makeKey(bucket, req);
    let entry = this.entries.get(key);
    if (!entry) {
      while (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value);
      entry = { count: 0, resetAt: now + policy.windowMs };
      this.entries.set(key, entry);
    }
    if (entry.count >= policy.limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    entry.count += 1;
    return { allowed: true, remaining: Math.max(0, policy.limit - entry.count), resetAt: entry.resetAt };
  }

  reset(bucket, req) { this.entries.delete(this.makeKey(bucket, req)); }
  get size() { return this.entries.size; }
}

function rejectRateLimited(res, retryAfter) {
  res.setHeader("Retry-After", String(retryAfter));
  return res.status(429).json({ ok: false, error: { code: "RATE_LIMITED", message: RATE_LIMIT_MESSAGE } });
}

// This bounded in-memory limiter is intentionally instance-local. It adds a
// useful abuse barrier on each server/serverless instance, but is not a global
// distributed quota and resets when an instance is recycled.
const authRateLimiter = new AuthRateLimiter();

module.exports = { POLICIES, RATE_LIMIT_MESSAGE, AuthRateLimiter, authRateLimiter, requestIdentity, hashedIdentity, rejectRateLimited };
