"use strict";

const crypto = require("node:crypto");
const db = require("../db");
const resetToken = require("../auth/resetToken");

async function invalidateUnusedForUser(userId, client = db) { await client.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL", [userId]); }
async function create(userId, rawToken, ttlSeconds, client = db) { const result = await client.query("INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+($4 * INTERVAL '1 second')) RETURNING id,user_id,token_hash,expires_at,used_at,created_at", [crypto.randomUUID(), userId, resetToken.hashToken(rawToken), ttlSeconds]); return result.rows[0]; }
async function findValidForUpdate(rawToken, client = db) { if (!rawToken) return null; const result = await client.query("SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE", [resetToken.hashToken(rawToken)]); return result.rows[0] || null; }
async function markUsed(id, client = db) { await client.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1 AND used_at IS NULL", [id]); }
async function cleanup(limit = 100, client = db) { const bounded = Math.max(1, Math.min(500, Number(limit) || 100)); await client.query("WITH doomed AS (SELECT id FROM password_reset_tokens WHERE expires_at<=NOW() OR used_at<NOW()-INTERVAL '7 days' ORDER BY created_at LIMIT $1) DELETE FROM password_reset_tokens p USING doomed d WHERE p.id=d.id", [bounded]); }

module.exports = { name: "passwordResetTokens", invalidateUnusedForUser, create, findValidForUpdate, markUsed, cleanup };
