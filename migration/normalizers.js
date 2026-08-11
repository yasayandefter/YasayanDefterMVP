"use strict";

const crypto = require("node:crypto");

function stableUuid(kind, legacyId) {
  const hash = crypto.createHash("sha256").update(`${kind}:${String(legacyId)}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function text(value, max = 1000) { return typeof value === "string" || typeof value === "number" ? String(value).replace(/\s+/g, " ").trim().slice(0, max) : ""; }
function iso(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null; }
function normalizedTopic(value) { return text(value, 240).toLocaleLowerCase("tr-TR").replace(/[\s\p{P}\p{S}]+/gu, " "); }
function array(value) { return Array.isArray(value) ? value : []; }
function classroom(row, schoolId) { return { id: stableUuid("classroom", row?.id), legacyId: text(row?.id, 120), schoolId, name: text(row?.name, 120), createdAt: iso(row?.createdAt), updatedAt: iso(row?.updatedAt) }; }
function student(row, classroomId) { return { id: stableUuid("student", row?.id), legacyId: text(row?.id, 120), classroomId, userId: null, displayName: text(row?.displayName, 100), createdAt: iso(row?.createdAt), updatedAt: iso(row?.updatedAt) }; }
function memory(row, studentId) { const topic = text(row?.topic || row?.title, 240); return { id: stableUuid("memory", row?.id || `${studentId}:${normalizedTopic(topic)}`), legacyId: text(row?.id, 120), studentId: studentId || null, topic, normalizedTopic: normalizedTopic(topic), title: text(row?.title || topic, 240), summary: text(row?.summary || row?.interesting, 4000), confidence: Number.isFinite(Number(row?.confidence)) ? Number(row.confidence) : 0, sourceCount: Number(row?.sourceCount || row?.sources?.length || 0), audienceLevel: text(row?.audienceLevel, 40) || "general", timesSearched: Math.max(1, Number(row?.timesSearched) || 1), keyConcepts: array(row?.keyConcepts || row?.keywords).slice(0, 50), keyFacts: array(row?.keyFacts || row?.facts).slice(0, 50), relatedTopics: array(row?.relatedTopics || row?.related).slice(0, 50), reliabilitySummary: row?.reliabilitySummary && typeof row.reliabilitySummary === "object" ? row.reliabilitySummary : {}, quizSummary: row?.quizSummary || row?.quizScore || {}, createdAt: iso(row?.createdAt || row?.lastSearched), updatedAt: iso(row?.updatedAt || row?.lastSearched) }; }
function attempt(row, studentId) { const quiz = row?.quiz || {}; return { id: stableUuid("attempt", row?.id), legacyId: text(row?.id, 120), studentId: studentId || null, topic: text(row?.topic || quiz.topic, 240), difficulty: text(row?.difficulty || quiz.difficulty, 20) || "medium", questionType: text(row?.questionType || quiz.type, 40) || "multiple-choice", status: row?.completed ? "COMPLETED" : "ACTIVE", score: Number(row?.summary?.correct || row?.score || 0), xpAwarded: Number(row?.xpAwarded || row?.summary?.xpAwarded || 0), startedAt: iso(row?.createdAt), completedAt: iso(row?.completedAt), questions: array(quiz.questions), answers: array(row?.answers) }; }

module.exports = { stableUuid, text, iso, normalizedTopic, classroom, student, memory, attempt };
