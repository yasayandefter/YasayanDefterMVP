"use strict";

const RANKS = Object.freeze({ high: 0, medium: 1, low: 2 });
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function attentionFor(profile) {
  const mastery = profile.topicProgress.length ? Math.round(profile.topicProgress.reduce((sum, item) => sum + number(item.mastery), 0) / profile.topicProgress.length) : 0;
  const weak = Array.isArray(profile.weakConcepts) ? profile.weakConcepts.length : 0;
  if (mastery < 40 || (profile.answeredQuestions > 0 && profile.accuracy < 45) || weak >= 2) return "high";
  if (mastery < 60 || (profile.answeredQuestions > 0 && profile.accuracy < 65) || weak === 1) return "medium";
  return "low";
}
function buildClassroomSummary(classroom, students, profiles) {
  const rows = students.map((student, index) => { const profile = profiles[index] || {}; const topicProgress = Array.isArray(profile.topicProgress) ? profile.topicProgress : []; const averageMastery = topicProgress.length ? Math.round(topicProgress.reduce((sum, item) => sum + number(item.mastery), 0) / topicProgress.length) : 0; return { id: student.id, displayName: student.displayName, level: Math.max(1, Math.round(number(profile.level, 1))), totalXP: Math.max(0, Math.round(number(profile.totalXP))), accuracy: Math.max(0, Math.min(100, Math.round(number(profile.accuracy)))), averageMastery, weakConceptCount: Array.isArray(profile.weakConcepts) ? profile.weakConcepts.length : 0, attentionLevel: attentionFor({ ...profile, topicProgress }) }; });
  const average = key => rows.length ? Math.round(rows.reduce((sum, item) => sum + number(item[key]), 0) / rows.length) : 0;
  const topics = profiles.flatMap(profile => Array.isArray(profile.topicProgress) ? profile.topicProgress : []);
  const topicMap = new Map(); topics.forEach(item => { const current = topicMap.get(item.topic) || { topic: item.topic, mastery: 0, count: 0 }; current.mastery += number(item.mastery); current.count += 1; topicMap.set(item.topic, current); });
  const rankedTopics = [...topicMap.values()].map(item => ({ topic: item.topic, mastery: Math.round(item.mastery / item.count) })).sort((a, b) => b.mastery - a.mastery || a.topic.localeCompare(b.topic, "tr"));
  return { classroom: { id: classroom.id, name: classroom.name, studentCount: students.length }, overview: { averageAccuracy: average("accuracy"), averageMastery: average("averageMastery"), totalCompletedQuizzes: profiles.reduce((sum, profile) => sum + number(profile.completedQuizzes), 0), totalResearchTopics: profiles.reduce((sum, profile) => sum + number(profile.researchedTopics), 0) }, students: rows.sort((a, b) => RANKS[a.attentionLevel] - RANKS[b.attentionLevel] || a.displayName.localeCompare(b.displayName, "tr")), strongestTopics: rankedTopics.slice(0, 5), weakestTopics: rankedTopics.slice(-5).reverse(), attentionNeeded: rows.filter(item => item.attentionLevel !== "low").map(item => ({ studentId: item.id, displayName: item.displayName, priority: item.attentionLevel, reason: item.attentionLevel === "high" ? "Düşük hakimiyet veya başarı." : "Gelişim takibi önerilir." })) };
}
module.exports = { RANKS, attentionFor, buildClassroomSummary };
