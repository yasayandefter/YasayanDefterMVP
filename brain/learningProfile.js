"use strict";

const LEVELS = Object.freeze([0, 100, 250, 450, 700, 1000, 1400]);
const LIMITS = Object.freeze({ topics: 100, concepts: 20, recommendations: 6 });

function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function normalize(value) {
  return text(value).toLocaleLowerCase("tr-TR").replace(/[\s\p{P}\p{S}]+/gu, " ");
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validDate(value, fallback) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : fallback;
}

function unique(values, limit = LIMITS.concepts) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map(text).filter(value => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function calculateLevel(totalXP) {
  const xp = Math.max(0, number(totalXP));
  let level = 1;
  LEVELS.forEach((threshold, index) => { if (xp >= threshold) level = index + 1; });
  const nextThreshold = LEVELS[level] || LEVELS[LEVELS.length - 1] + 400;
  return { level, totalXP: xp, nextLevelXP: nextThreshold, xpToNextLevel: Math.max(0, nextThreshold - xp) };
}

function quizStats(record) {
  const score = record?.quizScore && typeof record.quizScore === "object" ? record.quizScore : null;
  const total = Math.max(0, number(score?.total));
  const correct = Math.min(total, Math.max(0, number(score?.score)));
  return { attempts: score ? 1 : 0, answered: total, correct, incorrect: Math.max(0, total - correct), skipped: Math.max(0, number(score?.skipped)), accuracy: total ? Math.round(correct / total * 100) : 0, weakConcepts: unique(score?.weakConcepts, LIMITS.concepts) };
}

function masteryFor(record, stats, now) {
  const research = Math.min(25, Math.max(0, number(record?.timesSearched) * 10));
  const quiz = stats.attempts ? stats.accuracy * 0.55 : 0;
  const repetition = Math.min(15, stats.attempts * 7);
  const weakPenalty = Math.min(20, stats.weakConcepts.length * 5);
  const date = validDate(record?.updatedAt, now);
  const ageDays = Math.max(0, (now - date) / 86400000);
  const recency = ageDays <= 7 ? 10 : ageDays <= 30 ? 5 : 0;
  return Math.max(0, Math.min(100, Math.round(research + quiz + repetition + recency - weakPenalty)));
}

function buildTopicProgress(record, now) {
  const stats = quizStats(record);
  const mastery = masteryFor(record, stats, now);
  const weak = stats.weakConcepts;
  const concepts = unique(record?.keyConcepts || record?.keywords);
  return { topic: text(record?.topic || record?.title), researchCount: Math.max(0, number(record?.timesSearched, 1)), quizAttempts: stats.attempts, questionsAnswered: stats.answered, correctAnswers: stats.correct, accuracy: stats.accuracy, mastery, lastStudiedAt: validDate(record?.updatedAt, now).toISOString(), weakConcepts: weak, strongConcepts: mastery >= 75 ? concepts : [] };
}

function buildProfile(records, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  const safeRecords = (Array.isArray(records) ? records : []).filter(item => item && typeof item === "object" && text(item.topic || item.title)).slice(0, LIMITS.topics);
  const topicProgress = safeRecords.map(record => buildTopicProgress(record, current));
  const quiz = topicProgress.reduce((sum, item) => ({ attempts: sum.attempts + item.quizAttempts, answered: sum.answered + item.questionsAnswered, correct: sum.correct + item.correctAnswers, incorrect: sum.incorrect + Math.max(0, item.questionsAnswered - item.correctAnswers) }), { attempts: 0, answered: 0, correct: 0, incorrect: 0 });
  const weak = new Map(); const strong = new Map();
  topicProgress.forEach(item => { item.weakConcepts.forEach(concept => weak.set(concept, (weak.get(concept) || 0) + 1)); item.strongConcepts.forEach(concept => strong.set(concept, (strong.get(concept) || 0) + 1)); });
  const totalXP = safeRecords.reduce((sum, record) => { const stats = quizStats(record); const awarded = number(record?.quizScore?.xpAwarded); return sum + Math.max(0, number(record.timesSearched, 1)) * 10 + (awarded || (stats.correct * 8 + (stats.attempts ? 10 : 0))); }, 0);
  const level = calculateLevel(totalXP);
  const recentTopics = [...topicProgress].sort((a, b) => new Date(b.lastStudiedAt) - new Date(a.lastStudiedAt)).slice(0, 8).map(item => item.topic);
  return { totalXP: level.totalXP, level: level.level, nextLevelXP: level.nextLevelXP, xpToNextLevel: level.xpToNextLevel, researchedTopics: safeRecords.length, completedQuizzes: quiz.attempts, answeredQuestions: quiz.answered, correctAnswers: quiz.correct, incorrectAnswers: quiz.incorrect, skippedAnswers: safeRecords.reduce((sum, record) => sum + quizStats(record).skipped, 0), accuracy: quiz.answered ? Math.round(quiz.correct / quiz.answered * 100) : 0, strongConcepts: [...strong.keys()].slice(0, LIMITS.concepts), weakConcepts: [...weak.keys()].slice(0, LIMITS.concepts), recentTopics, topicProgress, lastActivity: recentTopics.length ? topicProgress.find(item => item.topic === recentTopics[0])?.lastStudiedAt || null : null };
}

function buildRecommendations(profile, records = []) {
  const recommendations = [];
  const weak = Array.isArray(profile?.weakConcepts) ? profile.weakConcepts : [];
  weak.slice(0, 2).forEach(concept => recommendations.push({ type: "weak-concept", topic: concept, text: `${concept} kavramını tekrar gözden geçirmen faydalı olabilir.` }));
  [...(profile?.topicProgress || [])].sort((a, b) => a.mastery - b.mastery).slice(0, 2).forEach(item => recommendations.push({ type: "low-mastery", topic: item.topic, text: `${item.topic} konusunda %${item.mastery} hakimiyetin var. Bu konuyu tekrar çalışabilirsin.` }));
  [...(profile?.topicProgress || [])].filter(item => item.mastery >= 75).slice(0, 2).forEach(item => recommendations.push({ type: "advanced", topic: item.topic, text: `${item.topic} konusunda güçlü görünüyorsun. Bir üst zorluk seviyesinde quiz çözebilirsin.` }));
  const recordMap = new Map((Array.isArray(records) ? records : []).map(record => [normalize(record.topic), record]));
  for (const item of profile?.topicProgress || []) { const record = recordMap.get(normalize(item.topic)); for (const related of unique(record?.relatedTopics, 3)) { if (!profile.recentTopics.includes(related)) recommendations.push({ type: "related-topic", topic: related, text: `${item.topic} ile ilişkili ${related} konusunu keşfedebilirsin.` }); } }
  return recommendations.slice(0, LIMITS.recommendations);
}

module.exports = { LEVELS, calculateLevel, buildTopicProgress, buildProfile, buildRecommendations, masteryFor };
