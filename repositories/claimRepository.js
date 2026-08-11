"use strict";

const crypto = require("node:crypto");
const db = require("../db");

const CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ATTEMPTS = 5;
function hashClaim(code) { return crypto.createHash("sha256").update(String(code)).digest("hex"); }
function generateClaimCode(length = 10) { const bytes = crypto.randomBytes(length); return Array.from(bytes, byte => CLAIM_ALPHABET[byte % CLAIM_ALPHABET.length]).join(""); }
async function createClaim({ id, studentId, createdBy, expiresAt, code }, client = db) { const result = await client.query("INSERT INTO student_claim_tokens (id, student_id, token_hash, expires_at, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, student_id, expires_at", [id, studentId, hashClaim(code), expiresAt, createdBy]); return { record: result.rows[0], code }; }
async function findForUpdate(code, client = db) { const result = await client.query("SELECT * FROM student_claim_tokens WHERE token_hash = $1 FOR UPDATE", [hashClaim(code)]); return result.rows[0] || null; }
async function markUsed(id, userId, client = db) { await client.query("UPDATE student_claim_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL", [id]); }
async function recordFailure(id, client = db) { await client.query("UPDATE student_claim_tokens SET attempt_count = attempt_count + 1, locked_until = CASE WHEN attempt_count + 1 >= $2 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END WHERE id = $1", [id, MAX_ATTEMPTS]); }

module.exports = { name: "claims", CLAIM_ALPHABET, MAX_ATTEMPTS, hashClaim, generateClaimCode, createClaim, findForUpdate, markUsed, recordUsed: markUsed, recordFailure };
