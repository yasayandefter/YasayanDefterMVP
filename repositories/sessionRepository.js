"use strict";

const crypto = require("node:crypto");
const db = require("../db");

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
function hashToken(token) { return crypto.createHash("sha256").update(String(token)).digest("hex"); }
function createToken() { return crypto.randomBytes(32).toString("base64url"); }
async function createSession(userId, ttlSeconds, client = db) { const token = createToken(); const id = crypto.randomUUID(); const result = await client.query("INSERT INTO sessions (id, user_id, session_hash, expires_at) VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 second')) RETURNING id, user_id, expires_at", [id, userId, hashToken(token), ttlSeconds]); return { token, session: result.rows[0] }; }
async function findValidSession(token, client = db) { if (!token) return null; const result = await client.query("SELECT s.id AS session_id, s.user_id, s.expires_at, u.role, u.email, u.username, u.display_name, u.ui_preferences, u.status, st.id AS student_id FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN students st ON st.user_id = u.id WHERE s.session_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW() AND UPPER(u.status) = 'ACTIVE'", [hashToken(token)]); return result.rows[0] || null; }
async function touchSession(sessionId, client = db) { await client.query("UPDATE sessions SET last_seen_at = NOW() WHERE id = $1 AND last_seen_at < NOW() - ($2 * INTERVAL '1 millisecond')", [sessionId, TOUCH_INTERVAL_MS]); }
async function revokeSession(token, client = db) { if (token) await client.query("UPDATE sessions SET revoked_at = NOW() WHERE session_hash = $1 AND revoked_at IS NULL", [hashToken(token)]); }
async function revokeAllUserSessions(userId, client = db) { await client.query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [userId]); }
async function revokeOtherUserSessions(userId, currentSessionId, client = db) { await client.query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL", [userId, currentSessionId]); }
async function cleanupExpired(client = db) { await client.query("DELETE FROM sessions WHERE expires_at <= NOW() OR revoked_at < NOW() - INTERVAL '30 days'"); }

module.exports = { name: "sessions", TOUCH_INTERVAL_MS, hashToken, createToken, createSession, findValidSession, touchSession, revokeSession, revokeAllUserSessions, revokeOtherUserSessions, cleanupExpired };
