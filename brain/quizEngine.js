"use strict";
const { splitSentences } = require('./sentences');

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
  if (source.researchUnavailable || structured.generatedFrom?.usedFallback) return {topic:text(source.title || source.query),candidates:[],concepts:[],seed:text(source.query)};
  const add = (value, concept = "Genel", confidence = "medium", sourceSupport = "research") => {
    const raw = typeof value === "object" ? value?.text || value?.fact || value?.content : value;
    const parts = splitSentences(text(raw, 12000));
    if (!parts.length) return;
    if (parts.length > 1 || parts[0] !== text(raw, 12000)) { parts.forEach(part=>add(part,concept,confidence,sourceSupport)); return; }
    const statement = text(raw, 600);
    if (String(raw || '').length > 600 || /…$|\.\.\.$|\b\d+\.$/.test(statement)) return;
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
const NUMBER_WORDS = Object.freeze({ bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10 });
const ORDINAL_WORDS = Object.freeze({ birinci: 1, ikinci: 2, üçüncü: 3, dördüncü: 4, beşinci: 5, altıncı: 6, yedinci: 7, sekizinci: 8, dokuzuncu: 9, onuncu: 10 });

function numberValue(value) {
  const clean = String(value || "").toLocaleLowerCase("tr-TR").replace(/[.,]/g, "").trim();
  return /^\d+$/.test(clean) ? Number(clean) : NUMBER_WORDS[clean] || null;
}

function findMeasurements(statement) {
  const found = [];
  for (const match of statement.matchAll(/\b(yüksekliği|uzunluğu|genişliği|çapı|ağırlığı)\s+(\d[\d.,]*)\s*(km|m|kg|%|derece)\b/gi)) found.push({ label: match[1], value: match[2], unit: match[3] });
  for (const match of statement.matchAll(/\b(\d[\d.,]*)\s*(km|m|kg|%|derece)\s+(uzunluğunda|genişliğinde)\b/gi)) found.push({ label: match[3].toLocaleLowerCase("tr-TR").startsWith("geniş") ? "genişliği" : "uzunluğu", value: match[1], unit: match[2] });
  return found;
}
function normalizeMeasurementValue(value) {
  const raw = String(value || "");
  return /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw.replace(/,/g, ".");
}

function questionFromFact(candidate) {
  const statement = candidate.statement.replace(/[.!?]+$/, "").trim();
  const loweredStatement = statement.toLocaleLowerCase("tr-TR");
  const ordinal = Object.entries(ORDINAL_WORDS).find(([word]) => loweredStatement.includes(word));
  if (ordinal && /güneş sistem|gezegen/i.test(statement)) {
    const subject = statement.split(",")[0].trim();
    return { kind: "ordinal", prompt: `${subject}, Güneş'e yakınlık bakımından kaçıncı gezegendir?`, answer: String(ordinal[1]) };
  }
  const count = statement.match(/(?:^|\s)(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s+(?:doğal\s+)?([^,.!?]*?(?:uydu|uydusu|tane|tür))(?=\s|$|[.,!?])/i);
  if (count) {
    const subject = statement.split(/[,'’]/)[0].trim();
    const answer = numberValue(count[1]);
    if (answer !== null) {
      const prompt = /^\d/.test(subject) ? "Bu araştırmaya göre doğal uyduların sayısı kaçtır?" : `${subject}'ın doğal uyduları kaç tanedir?`;
      return { kind: "count", prompt, answer: String(answer) };
    }
  }
  const measurement = candidate.quizMeasurement || findMeasurements(statement)[0];
  if (measurement) {
    const value = normalizeMeasurementValue(measurement.value);
    const object = statement.match(new RegExp(`\\(([^,]+),\\s*${measurement.label}`, "i"))?.[1]?.trim();
    const subject = object ? `${object} adlı yapının` : "Kaynakta belirtilen yapının";
    return { kind: "measurement", prompt: `${subject} ${measurement.label} kaç ${measurement.unit}'dir?`, answer: `${value} ${measurement.unit}` };
  }
  const date = statement.match(/\b(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4}|\d{4})\b/);
  if (date && /tarih|savaş|savaşı|kuruldu|seçildi|cumhuriyet|gazi|ilan/i.test(statement)) {
    let prompt = "Bu araştırmada belirtilen tarih hangisidir?";
    if (/gazi.*sanını aldı|mareşallik/i.test(statement)) {
      const subject = statement.split(/[,(]/)[0].trim();
      prompt = `${subject || "Bu kişi"} hangi tarihte gazi sanını aldı?`;
    }
    else if (/cumhuriyet.*ilan|ilan.*cumhuriyet/i.test(statement)) prompt = "Cumhuriyet hangi tarihte ilan edildi?";
    else if (/^([^,(]+)\s*\(\s*\d{4}/.test(statement)) prompt = `${statement.match(/^([^,(]+)/)[1].trim()} hangi yılda doğdu?`;
    return { kind: "date", prompt, answer: date[1] };
  }
  const composition = statement.match(/^(.+?)\s+(.+?)\s+(oluşur|bulunur)\s*$/i);
  if (composition) {
    const prompt = composition[3].toLocaleLowerCase("tr-TR") === "bulunur"
      ? `${composition[1]} içinde ne bulunur?`
      : `${composition[1]} nelerden oluşur?`;
    return { kind: "property", prompt, answer: composition[2] };
  }
  const process = statement.match(/^(.+?\s+(?:verileri|yanıtları|soruları))\s+(.+?)\s+(saklanır|değerlendirilir|üretilir)\s*$/i);
  if (process) {
    const prompt = process[3].toLocaleLowerCase("tr-TR") === "saklanır"
      ? `${process[1]} ne amaçla saklanır?`
      : process[3].toLocaleLowerCase("tr-TR") === "değerlendirilir" ? `${process[1]} nasıl değerlendirilir?` : `${process[1]} nasıl üretilir?`;
    return { kind: "property", prompt, answer: process[2] };
  }
  const comma = statement.match(/^([^,]+),\s+(.+)$/);
  if (comma) {
    const subject = comma[1].trim();
    const rest = comma[2].replace(/[.!?]+$/, "").trim();
    let prompt = "";
    if (/ne için kullanılan|kullanılan/i.test(rest)) prompt = `${subject} ne için kullanılır?`;
    else if (/depolanır/i.test(rest)) prompt = `${subject} nerede depolanır?`;
    else if (/saklanır/i.test(rest)) prompt = `${subject} ne amaçla saklanır?`;
    else if (/değerlendirilir/i.test(rest)) prompt = `${subject} nasıl değerlendirilir?`;
    else if (/üretilir/i.test(rest)) prompt = `${subject} nasıl üretilir?`;
    else if (/adlandırılmıştır|adlandırılır/i.test(rest)) prompt = `${subject} nasıl adlandırılmıştır?`;
    if (prompt) return { kind: "property", prompt, answer: rest };
  }
  return null;
}

function expandCandidate(candidate) {
  const matches = findMeasurements(candidate.statement);
  if (matches.length <= 1) return [candidate];
  return matches.map((match, index) => ({ ...candidate, key: `${candidate.key}:measurement:${index}`, quizMeasurement: match }));
}

function sameTypeOptions(fact, pool, seed, index) {
  const parsed = questionFromFact(fact);
  if (!parsed) return null;
  const values = pool.map(questionFromFact).filter(Boolean).filter(item => item.kind === parsed.kind).map(item => item.answer);
  let distractors = [...new Set(values.filter(value => key(value) !== key(parsed.answer)))];
  if (parsed.kind === "ordinal" || parsed.kind === "count") {
    const number = Number(parsed.answer);
    distractors = [...new Set([...distractors, String(Math.max(1, number - 1)), String(number + 1), String(number + 2)])];
  } else if (parsed.kind === "measurement") {
    const match = parsed.answer.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (match) {
      const number = Number(match[1]);
      distractors = [...new Set([...distractors, `${Math.max(0, number - 1)} ${match[2]}`, `${number + 1} ${match[2]}`, `${number + 2} ${match[2]}`])];
    }
  }
  const options = deterministicOrder([parsed.answer, ...distractors], `${seed}:options:${index}`).slice(0, LIMITS.maxOptions);
  if (!options.some(option => key(option) === key(parsed.answer))) options[options.length - 1] = parsed.answer;
  const minimumOptions = parsed.kind === "property" ? 2 : 3;
  if (options.length < minimumOptions || new Set(options.map(key)).size !== options.length) return null;
  return { ...parsed, options };
}

function buildExplanation(candidate, correct, wasCorrect) {
  const prefix = wasCorrect ? "Doğru." : "Bu cevap doğru değil.";
  const guidance = wasCorrect ? "Kaynakta yer alan bilgiyle eşleşiyor." : "Doğru cevabı kaynakta verilen bilgi destekliyor. Bu noktayı tekrar gözden geçirebilirsin.";
  return text(`${prefix} ${guidance} ${candidate.statement}`, LIMITS.maxExplanation);
}

function buildMultipleChoiceQuestion(candidate, pool, index, seed, difficulty) {
  const parsed = sameTypeOptions(candidate, pool, seed, index);
  if (!parsed) return null;
  return {
    id: `quiz-${hash(`${seed}:mc:${candidate.key}:${index}`).toString(16)}`,
    type: "multiple-choice",
    difficulty,
    prompt: parsed.prompt,
    options: parsed.options,
    correctAnswer: parsed.answer,
    acceptedAnswers: [parsed.answer],
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
  const statement = truth ? candidate.statement : `“${candidate.statement}” ifadesi kaynak metindeki bilgiyle çelişir.`;
  if (!statement) return null;
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
  const sourcePool = deterministicOrder(normalized.candidates.flatMap(expandCandidate), normalized.seed);
  // Difficulty limits prompts, not distractor evidence. A single eligible
  // prompt still needs alternatives from the other validated source facts.
  const pool = sourcePool.filter(candidate => difficultyOf(candidate, normalized.candidates.indexOf(candidate)) === difficulty || difficulty === "medium");
  const questions = [];
  pool.forEach((candidate, index) => {
    if (questions.length >= requested) return;
    const question = type === "true-false"
      ? buildTrueFalseQuestion(candidate, index, normalized.seed, difficulty)
      : buildMultipleChoiceQuestion(candidate, sourcePool, index, normalized.seed, difficulty);
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
