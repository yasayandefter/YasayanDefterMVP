"use strict";

const crypto = require("node:crypto");
const quizEngine = require("./quizEngine");

const sessions = new Map();
const MAX_SESSIONS = 200;

function cleanText(value, limit = 240) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, limit);
}

function publicQuestion(question) {
  return {
    id: question.id,
    type: question.type,
    difficulty: question.difficulty,
    prompt: question.prompt,
    options: Array.isArray(question.options) ? question.options.slice(0, 4) : [],
    concept: question.concept,
    order: question.order
  };
}

function publicQuiz(session) {
  return {
    id: session.quiz.id,
    attemptId: session.id,
    topic: session.quiz.topic,
    difficulty: session.quiz.difficulty,
    type: session.quiz.type,
    requestedCount: session.quiz.requestedCount,
    questions: session.quiz.questions.map(publicQuestion),
    notice: session.quiz.notice || ""
  };
}

function publicQuizData(quiz) {
  return {
    id: quiz.id,
    attemptId: null,
    topic: quiz.topic,
    difficulty: quiz.difficulty,
    type: quiz.type,
    requestedCount: quiz.requestedCount,
    questions: Array.isArray(quiz.questions) ? quiz.questions.map(publicQuestion) : [],
    notice: quiz.notice || ""
  };
}

function start(input = {}, retryOf = "", studentId = "") {
  const source = input && typeof input === "object" ? input : {};
  const quiz = quizEngine.buildQuiz(source.research || source, {
    count: Math.min(10, Math.max(3, Number(source.count) || 5)),
    difficulty: quizEngine.normalizeDifficulty(source.difficulty),
    type: quizEngine.normalizeType(source.type)
  });
  let questions = quiz.questions;
  if (retryOf) {
    const previous = sessions.get(cleanText(retryOf, 100));
    if (previous?.completed) {
      const wrongIds = new Set(previous.answers.filter(item => !item.correct).map(item => item.questionId));
      questions = questions.filter(question => wrongIds.has(question.id));
      quiz.questions = questions.map((question, index) => ({ ...question, order: index }));
    }
  }
  const id = crypto.randomUUID();
  const session = { id, quiz, studentId: cleanText(studentId, 100), answers: [], completed: false, createdAt: new Date().toISOString(), completedAt: null, xpAwarded: 0 };
  sessions.set(id, session);
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  return { session, quiz: publicQuiz(session) };
}

function answer(attemptId, questionId, answer, skipped = false, studentId = "") {
  const session = sessions.get(cleanText(attemptId, 100));
  if (!session) return { error: "UNKNOWN_ATTEMPT" };
  if (session.studentId !== cleanText(studentId, 100)) return { error: "STUDENT_MISMATCH" };
  if (session.completed) return { error: "ATTEMPT_COMPLETED" };
  const id = cleanText(questionId, 160);
  const question = session.quiz.questions.find(item => item.id === id);
  if (!question) return { error: "UNKNOWN_QUESTION" };
  if (session.answers.some(item => item.questionId === id)) return { error: "DUPLICATE_ANSWER" };
  const result = quizEngine.evaluateAnswer(question, skipped ? "" : answer);
  const row = { questionId: id, correct: result.correct, skipped: Boolean(skipped) || result.skipped, answer: cleanText(answer), concept: question.concept };
  session.answers.push(row);
  return { result: { ...row, explanation: result.explanation } };
}

function complete(attemptId, studentId = "") {
  const session = sessions.get(cleanText(attemptId, 100));
  if (!session) return { error: "UNKNOWN_ATTEMPT" };
  if (session.studentId !== cleanText(studentId, 100)) return { error: "STUDENT_MISMATCH" };
  if (session.completed) return { summary: session.summary, duplicate: true };
  const total = session.quiz.questions.length;
  const skippedAnswered = session.answers.filter(item => item.skipped).length;
  const skipped = session.quiz.questions.filter(question => !session.answers.some(item => item.questionId === question.id)).length + skippedAnswered;
  const correct = session.answers.filter(item => item.correct).length;
  const answered = session.answers.length;
  const wrong = Math.max(0, answered - correct - skippedAnswered);
  const percentage = total ? Math.round(correct / total * 100) : 0;
  const weakConcepts = [...new Set(session.answers.filter(item => !item.correct && item.concept).map(item => item.concept))].slice(0, 20);
  const summary = { attemptId: session.id, quizId: session.quiz.id, topic: session.quiz.topic, difficulty: session.quiz.difficulty, total, answered, correct, incorrect: wrong, skipped, percentage, weakConcepts, xpAwarded: correct * ({ easy: 5, medium: 8, hard: 12 }[session.quiz.difficulty] || 8) + (total ? 10 : 0) + (percentage === 100 ? 15 : 0) };
  session.completed = true;
  session.completedAt = new Date().toISOString();
  session.xpAwarded = summary.xpAwarded;
  session.summary = summary;
  return { summary, duplicate: false };
}

function get(attemptId) { return sessions.get(cleanText(attemptId, 100)) || null; }

module.exports = { start, answer, complete, get, publicQuiz, publicQuizData };
