"use strict";

const LIMITS = Object.freeze({
  maxQuestions: 10,
  maxOptions: 4,
  maxText: 320,
  maxExplanation: 420,
  maxConcepts: 8,
  maxCandidates: 40
});

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const TYPES = new Set(["multiple-choice", "true-false"]);

function text(value, limit = LIMITS.maxText) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const clean = String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || /\[object Object\]|\bundefined\b|\bnull\b|\bError\b|javascript:|data:/i.test(clean)) return "";
  return clean.slice(0, limit).trim();
}

function key(value) {
  return text(value).toLocaleLowerCase("tr-TR").replace(/[\s\p{P}\p{S}]+/gu, " ");
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value || "")) {
    result ^= char.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function deterministicOrder(items, seed) {
  return items.map((item, index) => ({ item, index, score: hash(`${seed}:${index}:${key(item)}`) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(entry => entry.item);
}

function normalizeQuizInput(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const structured = source.structuredContent && typeof source.structuredContent === "object" ? source.structuredContent : {};
  const concepts = Array.isArray(structured.keyConcepts) ? structured.keyConcepts : [];
  const facts = Array.isArray(structured.keyFacts) ? structured.keyFacts : [];
  const sections = Array.isArray(structured.sections) ? structured.sections : [];
  const candidates = [];
  const add = (value, concept = "Genel", confidence = "medium", sourceSupport = "research") => {
    const statement = text(typeof value === "object" ? value.text || value.fact || value.content : value);
    if (!statement || statement.length < 24 || /[.!?]$/.test(statement) === false) return;
    const normalized = key(statement);
    if (candidates.some(item => item.key === normalized)) return;
    candidates.push({ statement, key: normalized, concept: text(typeof concept === "object" ? concept.term || concept.title : concept) || "Genel", confidence: text(confidence) || "medium", sourceSupport });
  };
  facts.forEach(item => add(item, item?.concept || item?.term || "Genel", item?.confidence || "medium", "keyFact"));
  sections.forEach(section => {
    add(section?.text, section?.title || "Genel", "medium", "section");
    (Array.isArray(section?.points) ? section.points : []).forEach(point => add(point, section?.title || "Genel", "medium", "section-point"));
  });
  add(structured.summary, "Genel", "medium", "summary");
  add(source.text, "Genel", "medium", "research-text");
  return {
    topic: text(source.query || source.title || source.analysis?.topic || "Araştırma", 120),
    candidates: candidates.slice(0, LIMITS.maxCandidates),
    concepts: concepts.map(item => text(item?.term || item?.title || item?.name || item)).filter(Boolean).slice(0, LIMITS.maxConcepts),
    seed: text(source.query || source.title || "research", 120)
  };
}

function difficultyOf(candidate, index) {
  if (candidate.statement.length < 110 && index < 3) return "easy";
  if (candidate.concept !== "Genel" || candidate.statement.length > 180) return "hard";
  return "medium";
}

function normalizeDifficulty(value) {
  return DIFFICULTIES.has(value) ? value : "medium";
}

function normalizeType(value) {
  return TYPES.has(value) ? value : "multiple-choice";
}

function negatedStatement(statement) {
  const base = statement.replace(/[.!?]+$/, "").trim();
  if (/(dır|dir|dur|dür|tir|tır|tur|tür)$/i.test(base)) return `${base.replace(/(dır|dir|dur|dür|tir|tır|tur|tür)$/i, "değildir")}.`;
  if (/değil$/i.test(base)) return `${base.replace(/değil$/i, "")}dir.`;
  return `${base} değildir.`;
}

function buildExplanation(candidate, correct, wasCorrect) {
  const prefix = wasCorrect ? "Doğru." : "Bu cevap doğru değil.";
  const guidance = wasCorrect ? "Kaynakta yer alan bilgiyle eşleşiyor." : "Doğru cevabı kaynakta verilen bilgi destekliyor. Bu noktayı tekrar gözden geçirebilirsin.";
  return text(`${prefix} ${guidance} ${candidate.statement}`, LIMITS.maxExplanation);
}

function buildMultipleChoiceQuestion(candidate, pool, index, seed, difficulty) {
  const distractors = deterministicOrder(pool.filter(item => item.key !== candidate.key).map(item => item.statement), `${seed}:distractors:${index}`).slice(0, LIMITS.maxOptions - 1);
  const options = deterministicOrder([candidate.statement, ...distractors], `${seed}:options:${index}`);
  if (options.length < 2 || !options.some(option => key(option) === candidate.key)) return null;
  return {
    id: `quiz-${hash(`${seed}:mc:${candidate.key}:${index}`).toString(16)}`,
    type: "multiple-choice",
    difficulty,
    prompt: `${candidate.concept} hakkında aşağıdakilerden hangisi kaynaklarda yer alan bilgidir?`,
    options,
    correctAnswer: candidate.statement,
    acceptedAnswers: [candidate.statement],
    explanation: buildExplanation(candidate, candidate.statement, true),
    sourceFact: candidate.statement,
    concept: candidate.concept,
    confidence: candidate.confidence,
    sourceSupport: candidate.sourceSupport,
    order: index
  };
}

function buildTrueFalseQuestion(candidate, index, seed, difficulty) {
  const truth = index % 2 === 0;
  const statement = truth ? candidate.statement : negatedStatement(candidate.statement);
  if (!statement || key(statement) === candidate.key) return null;
  const correctAnswer = truth ? "true" : "false";
  return {
    id: `quiz-${hash(`${seed}:tf:${candidate.key}:${index}`).toString(16)}`,
    type: "true-false",
    difficulty,
    prompt: statement,
    options: ["true", "false"],
    correctAnswer,
    acceptedAnswers: [correctAnswer, correctAnswer === "true" ? "doğru" : "yanlış"],
    explanation: buildExplanation(candidate, correctAnswer, true),
    sourceFact: candidate.statement,
    concept: candidate.concept,
    confidence: candidate.confidence,
    sourceSupport: truth ? candidate.sourceSupport : "derived-negation",
    order: index
  };
}

function buildQuiz(input, options = {}) {
  const normalized = normalizeQuizInput(input);
  const difficulty = normalizeDifficulty(options.difficulty);
  const type = normalizeType(options.type);
  const requested = Math.min(LIMITS.maxQuestions, Math.max(3, Number(options.count) || 5));
  const pool = deterministicOrder(normalized.candidates.filter(candidate => difficultyOf(candidate, normalized.candidates.indexOf(candidate)) === difficulty || difficulty === "medium"), normalized.seed);
  const questions = [];
  pool.forEach((candidate, index) => {
    if (questions.length >= requested) return;
    const question = type === "true-false"
      ? buildTrueFalseQuestion(candidate, index, normalized.seed, difficulty)
      : buildMultipleChoiceQuestion(candidate, pool, index, normalized.seed, difficulty);
    if (question && !questions.some(item => item.id === question.id)) questions.push(question);
  });
  return {
    id: `quiz-${hash(`${normalized.seed}:${difficulty}:${type}:${requested}`).toString(16)}`,
    topic: normalized.topic,
    difficulty,
    type,
    requestedCount: requested,
    questions,
    notice: questions.length < requested ? "Bu konu için güvenli biçimde hazırlanabilen soru sayısı sınırlıydı." : ""
  };
}

function evaluateAnswer(question, answer) {
  const normalizedAnswer = key(answer);
  const accepted = (question?.acceptedAnswers || [question?.correctAnswer]).map(key).filter(Boolean);
  const correct = Boolean(normalizedAnswer && accepted.includes(normalizedAnswer));
  return { correct, skipped: !normalizedAnswer, answer: text(answer), explanation: buildExplanation({ statement: text(question?.sourceFact) }, question?.correctAnswer, correct) };
}

function summarizeQuizResult(quiz, answers = []) {
  const rows = quiz?.questions || [];
  const results = rows.map((question, index) => ({ question, ...(answers[index] || evaluateAnswer(question, "")) }));
  const correct = results.filter(item => item.correct).length;
  const skipped = results.filter(item => item.skipped).length;
  const wrong = Math.max(0, results.length - correct - skipped);
  const weakConcepts = identifyWeakConcepts(results);
  return { quizId: quiz?.id || "quiz", total: results.length, correct, wrong, skipped, percentage: results.length ? Math.round(correct / results.length * 100) : 0, difficulty: quiz?.difficulty || "medium", type: quiz?.type || "multiple-choice", weakConcepts, results };
}

function identifyWeakConcepts(results = []) {
  const counts = new Map();
  results.filter(item => !item.correct).forEach(item => {
    const concept = text(item.question?.concept) || "Genel";
    counts.set(concept, (counts.get(concept) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || key(a[0]).localeCompare(key(b[0]))).slice(0, LIMITS.maxConcepts).map(([concept, count]) => ({ concept, count, recommendation: `${concept} konusunu tekrar gözden geçirmen faydalı olabilir.` }));
}

function buildRetryQuiz(quiz, result) {
  const wrongIds = new Set((result?.results || []).filter(item => !item.correct).map(item => item.question?.id));
  const questions = (quiz?.questions || []).filter(question => wrongIds.has(question.id)).map((question, index) => ({ ...question, order: index, options: deterministicOrder(question.options || [], `${quiz.id}:retry:${index}`) }));
  return { ...quiz, id: `${quiz.id}-retry`, questions, retry: true, requestedCount: questions.length };
}

function calculateXp(result, awardedAttempts = new Set()) {
  if (!result || !result.quizId || awardedAttempts.has(result.quizId)) return { xp: 0, duplicate: true };
  const points = { easy: 5, medium: 8, hard: 12 };
  const xp = result.correct * (points[result.difficulty] || points.medium) + (result.total ? 10 : 0) + (result.percentage === 100 ? 15 : 0);
  awardedAttempts.add(result.quizId);
  return { xp: Number.isFinite(xp) ? xp : 0, duplicate: false };
}

module.exports = {
  LIMITS,
  normalizeQuizInput,
  normalizeDifficulty,
  normalizeType,
  buildMultipleChoiceQuestion,
  buildTrueFalseQuestion,
  buildQuiz,
  evaluateAnswer,
  summarizeQuizResult,
  identifyWeakConcepts,
  buildRetryQuiz,
  calculateXp
};
