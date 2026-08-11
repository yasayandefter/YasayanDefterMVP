"use strict";

function emptyCounts() { return { schools: 0, users: 0, students: 0, classrooms: 0, memberships: 0, memoryRecords: 0, quizAttempts: 0, quizQuestions: 0, quizAnswers: 0, xpEvents: 0 }; }
function conflict(code, severity, count = 1) { return { code, severity, count }; }
function aggregateConflicts(items) { const map = new Map(); for (const item of items) { const key = `${item.code}:${item.severity}`; map.set(key, { ...item, count: (map.get(key)?.count || 0) + item.count }); } return [...map.values()]; }
module.exports = { emptyCounts, conflict, aggregateConflicts };
