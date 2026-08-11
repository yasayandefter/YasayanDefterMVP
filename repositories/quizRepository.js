"use strict";

const crypto = require("node:crypto");
const db = require("../db");
const { mapDatabaseError, jsonValue, page } = require("./errors");

function mapAttempt(row) { if (!row) return null; const iso = value => value instanceof Date ? value.toISOString() : value || null; return { id: row.id, studentId: row.student_id, topic: row.topic, difficulty: row.difficulty, questionType: row.question_type, status: row.status, score: Number(row.score || 0), xpAwarded: Number(row.xp_awarded || 0), startedAt: iso(row.started_at), completedAt: iso(row.completed_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
async function createAttempt({ id = crypto.randomUUID(), studentId, topic, difficulty = "medium", questionType = "multiple-choice" }, client = db) { try { const result = await client.query("INSERT INTO quiz_attempts (id, student_id, topic, difficulty, question_type, status) VALUES ($1,$2,$3,$4,$5,'ACTIVE') RETURNING *", [id, studentId, topic, difficulty, questionType]); return mapAttempt(result.rows[0]); } catch (error) { throw mapDatabaseError(error, "QUIZ_ATTEMPT_CREATE_FAILED"); } }
async function findAttemptById(id, client = db) { const result = await client.query("SELECT * FROM quiz_attempts WHERE id = $1", [id]); return mapAttempt(result.rows[0]); }
async function findAttemptForStudent(id, studentId, client = db) { const result = await client.query("SELECT * FROM quiz_attempts WHERE id = $1 AND student_id = $2", [id, studentId]); return mapAttempt(result.rows[0]); }
async function insertQuestions(attemptId, questions, client = db) { const rows = []; for (const [index, question] of (Array.isArray(questions) ? questions : []).entries()) { const id = question.id || crypto.randomUUID(); const result = await client.query("INSERT INTO quiz_attempt_questions (id, attempt_id, ordinal, prompt, options, correct_option_private, concept) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id, attempt_id, ordinal, prompt, options, concept", [id, attemptId, index, String(question.prompt || ""), jsonValue(question.options, "[]"), String(question.correct || question.correctOption || ""), question.concept || null]); rows.push(result.rows[0]); } return rows; }
async function recordAnswer({ id = crypto.randomUUID(), attemptId, questionId, answer = "", isCorrect = false, skipped = false }, client = db) { try { const result = await client.query("INSERT INTO quiz_attempt_answers (id, attempt_id, question_id, answer, is_correct, skipped) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (attempt_id, question_id) DO NOTHING RETURNING *", [id, attemptId, questionId, String(answer).slice(0, 500), Boolean(isCorrect), Boolean(skipped)]); return result.rows[0] || null; } catch (error) { throw mapDatabaseError(error, "QUIZ_ANSWER_FAILED"); } }
async function listAnswers(attemptId, client = db) { const result = await client.query("SELECT id, attempt_id, question_id, answer, is_correct, skipped, answered_at FROM quiz_attempt_answers WHERE attempt_id = $1 ORDER BY answered_at, id", [attemptId]); return result.rows; }
async function completeAttempt({ attemptId, studentId, score, xpAmount = 0 }, client = db) {
  const operation = async transactionClient => {
    const locked = await transactionClient.query("SELECT * FROM quiz_attempts WHERE id = $1 AND student_id = $2 FOR UPDATE", [attemptId, studentId]);
    const attempt = locked.rows[0]; if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
    if (attempt.status === "COMPLETED") return { attempt: mapAttempt(attempt), duplicate: true, xp: null };
    const updated = await transactionClient.query("UPDATE quiz_attempts SET status = 'COMPLETED', score = $3, xp_awarded = $4, completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND student_id = $2 AND status <> 'COMPLETED' RETURNING *", [attemptId, studentId, Number(score) || 0, Number(xpAmount) || 0]);
    const xp = await transactionClient.query("INSERT INTO xp_events (id, student_id, attempt_id, amount, reason) VALUES ($1,$2,$3,$4,'quiz') ON CONFLICT (attempt_id) DO NOTHING RETURNING id, amount", [crypto.randomUUID(), studentId, attemptId, Number(xpAmount) || 0]);
    return { attempt: mapAttempt(updated.rows[0]), duplicate: false, xp: xp.rows[0] || null };
  };
  return (client ? operation(client) : db.withTransaction(operation)).catch(error => { throw mapDatabaseError(error, "QUIZ_COMPLETE_FAILED"); });
}
async function findRecentAttempts(studentId, options = {}, client = db) { const limit = page(options.limit); const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0); const result = await client.query("SELECT * FROM quiz_attempts WHERE student_id = $1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3", [studentId, limit, offset]); return result.rows.map(mapAttempt); }
async function findAttempt(id, client = db) { return findAttemptById(id, client); }
async function saveAttempt(input, client = db) { return createAttempt(input, client); }
async function getProgressSource(studentId, options = {}, client = db) { return findRecentAttempts(studentId, options, client); }
async function findXpByAttempt(attemptId, client = db) { const result = await client.query("SELECT id, student_id, attempt_id, amount, reason, created_at FROM xp_events WHERE attempt_id = $1", [attemptId]); return result.rows[0] || null; }

module.exports = { name: "quiz", mapAttempt, createAttempt, findAttemptById, findAttemptForStudent, insertQuestions, recordAnswer, listAnswers, completeAttempt, findRecentAttempts, findAttempt, saveAttempt, getProgressSource, findXpByAttempt };
