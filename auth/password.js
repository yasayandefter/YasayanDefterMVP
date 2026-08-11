"use strict";

const crypto = require("node:crypto");

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function validatePassword(password) {
  if (typeof password !== "string" || !password.trim() || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw new Error("INVALID_PASSWORD");
  return password;
}

function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltValue, hashValue] = parts;
  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(hashValue, "base64url");
  if (!salt.length || !expected.length) return false;
  try {
    const actual = crypto.scryptSync(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) { return false; }
}

module.exports = { PASSWORD_MIN, PASSWORD_MAX, validatePassword, hashPassword, verifyPassword };
