"use strict";

const db = require("../db");

function email(value) { return typeof value === "string" ? value.trim().toLowerCase().slice(0, 240) : ""; }
function username(value) { return typeof value === "string" ? value.trim().toLowerCase().slice(0, 64) : ""; }
function displayName(value) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 120) : ""; }
function validateEmail(value) { const normalized = email(value); if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("INVALID_EMAIL"); return normalized; }
function validateUsername(value) { const normalized = username(value); if (!normalized || normalized.length < 3 || !/^[a-z0-9._-]+$/.test(normalized)) throw new Error("INVALID_USERNAME"); return normalized; }
function safeUser(row) { return row ? { id: row.id, role: row.role, email: row.email || null, username: row.username || null, displayName: row.display_name || row.displayName || "", status: row.status } : null; }

async function findById(id, client = db) { const result = await client.query("SELECT u.*, s.id AS student_id FROM users u LEFT JOIN students s ON s.user_id = u.id WHERE u.id = $1", [id]); return result.rows[0] || null; }
async function findByEmail(value, client = db) { const result = await client.query("SELECT u.*, s.id AS student_id FROM users u LEFT JOIN students s ON s.user_id = u.id WHERE LOWER(u.email) = LOWER($1)", [email(value)]); return result.rows[0] || null; }
async function findByUsername(value, client = db) { const result = await client.query("SELECT u.*, s.id AS student_id FROM users u LEFT JOIN students s ON s.user_id = u.id WHERE LOWER(u.username) = LOWER($1)", [username(value)]); return result.rows[0] || null; }
async function findByIdentifier(value, client = db) { return String(value || "").includes("@") ? findByEmail(value, client) : findByUsername(value, client); }
async function createTeacher({ id, email: value, displayName: name, passwordHash }, client = db) { const result = await client.query("INSERT INTO users (id, role, email, display_name, password_hash, status) VALUES ($1, 'TEACHER', $2, $3, $4, 'ACTIVE') RETURNING *", [id, validateEmail(value), displayName(name), passwordHash]); return result.rows[0]; }
async function createStudentUser({ id, username: value, passwordHash }, client = db) { const result = await client.query("INSERT INTO users (id, role, username, password_hash, status) VALUES ($1, 'STUDENT', $2, $3, 'ACTIVE') RETURNING *", [id, validateUsername(value), passwordHash]); return result.rows[0]; }
async function linkStudentUser(studentId, userId, client = db) { const result = await client.query("UPDATE students SET user_id = $1, updated_at = NOW() WHERE id = $2 AND user_id IS NULL RETURNING *", [userId, studentId]); return result.rows[0] || null; }
async function updatePasswordHash(userId, passwordHash, client = db) { await client.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [passwordHash, userId]); }
async function updateStatus(userId, status, client = db) { if (!["ACTIVE", "DISABLED"].includes(status)) throw new Error("INVALID_ACCOUNT_STATUS"); await client.query("UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2", [status, userId]); }

module.exports = { name: "users", email, username, displayName, validateEmail, validateUsername, safeUser, findById, findByEmail, findByUsername, findByIdentifier, createTeacher, createStudentUser, linkStudentUser, updatePasswordHash, updateStatus };
