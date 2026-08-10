"use strict";

const STATUS_BANDS = Object.freeze([
  { key: "support", label: "Desteğe İhtiyaç Var", min: 0, max: 39 },
  { key: "developing", label: "Gelişiyor", min: 40, max: 69 },
  { key: "good", label: "İyi", min: 70, max: 84 },
  { key: "strong", label: "Güçlü", min: 85, max: 100 }
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clean(value, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : fallback;
}

function classifyMastery(value) {
  const mastery = Math.max(0, Math.min(100, Math.round(numeric(value))));
  return STATUS_BANDS.find(band => mastery >= band.min && mastery <= band.max) || STATUS_BANDS[0];
}

function safeTopics(profile) {
  return (Array.isArray(profile?.topicProgress) ? profile.topicProgress : [])
    .filter(item => item && typeof item === "object" && clean(item.topic))
    .map(item => {
      const mastery = Math.max(0, Math.min(100, Math.round(numeric(item.mastery))));
      const status = classifyMastery(mastery);
      return {
        topic: clean(item.topic), mastery, status: status.key, statusLabel: status.label,
        accuracy: Math.max(0, Math.min(100, Math.round(numeric(item.accuracy)))),
        quizAttempts: Math.max(0, Math.round(numeric(item.quizAttempts))),
        lastStudiedAt: clean(item.lastStudiedAt, null),
        weakConcepts: Array.isArray(item.weakConcepts) ? item.weakConcepts.map(clean).filter(Boolean).slice(0, 6) : []
      };
    });
}

function buildAttention(topics, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  const output = [];
  topics.forEach(item => {
    if (item.mastery < 40) output.push({ type: "weak_topic", topic: item.topic, reason: `Konu hakimiyeti %${item.mastery}.`, priority: "high" });
    else if (item.accuracy < 50 && item.quizAttempts > 0) output.push({ type: "low_accuracy", topic: item.topic, reason: `Quiz başarısı %${item.accuracy}.`, priority: "medium" });
    if (item.weakConcepts.length) output.push({ type: "weak_concept", topic: item.topic, concept: item.weakConcepts[0], reason: `${item.weakConcepts[0]} kavramı tekrar ediyor.`, priority: item.mastery < 55 ? "high" : "medium" });
    const date = item.lastStudiedAt ? new Date(item.lastStudiedAt) : null;
    if (item.mastery < 70 && date && !Number.isNaN(date.getTime()) && current - date > 30 * 86400000) {
      output.push({ type: "overdue_review", topic: item.topic, reason: "Düşük hakimiyetli konu uzun süredir tekrar edilmedi.", priority: "medium" });
    }
  });
  const priority = { high: 0, medium: 1, low: 2 };
  return output.sort((a, b) => priority[a.priority] - priority[b.priority] || a.topic.localeCompare(b.topic, "tr")).slice(0, 20);
}

function teacherRecommendations(recommendations, topics) {
  const items = Array.isArray(recommendations) ? recommendations : [];
  const result = items.map(item => {
    const topic = clean(item?.topic, "Bu konu");
    if (item?.type === "weak-concept") return { type: item.type, topic, text: `${topic} kavramının tekrar edilmesi önerilir.` };
    if (item?.type === "advanced") return { type: item.type, topic, text: `${topic} konusunda ileri seviye quiz uygulanabilir.` };
    if (item?.type === "related-topic") return { type: item.type, topic, text: `${topic} ile ilişkili konu araştırılabilir.` };
    return { type: item?.type || "review", topic, text: `${topic} konusunda kısa tekrar sonrası yeni quiz önerilir.` };
  });
  if (!result.length) {
    const next = topics.find(item => item.mastery < 70);
    if (next) result.push({ type: "review", topic: next.topic, text: `${next.topic} konusunda kısa tekrar sonrası yeni quiz önerilir.` });
  }
  return result.slice(0, 8);
}

function buildTeacherSummary(profile = {}, recommendations = [], now = new Date()) {
  const topics = safeTopics(profile);
  const strongTopics = topics.filter(item => item.mastery >= 85);
  const developingTopics = topics.filter(item => item.mastery >= 40 && item.mastery < 85);
  const weakTopics = topics.filter(item => item.mastery < 40);
  const recentActivity = topics.slice().sort((a, b) => String(b.lastStudiedAt || "").localeCompare(String(a.lastStudiedAt || ""))).slice(0, 8);
  return {
    overview: {
      totalXP: Math.max(0, Math.round(numeric(profile?.totalXP))), level: Math.max(1, Math.round(numeric(profile?.level, 1))),
      overallAccuracy: Math.max(0, Math.min(100, Math.round(numeric(profile?.accuracy)))), completedQuizzes: Math.max(0, Math.round(numeric(profile?.completedQuizzes))),
      researchedTopicCount: Math.max(0, Math.round(numeric(profile?.researchedTopics))), totalAnsweredQuestions: Math.max(0, Math.round(numeric(profile?.answeredQuestions)))
    },
    learningStatus: { strongTopics, developingTopics, weakTopics },
    concepts: { strong: Array.isArray(profile?.strongConcepts) ? profile.strongConcepts.slice(0, 20) : [], weak: Array.isArray(profile?.weakConcepts) ? profile.weakConcepts.slice(0, 20) : [] },
    recentActivity,
    recommendations: teacherRecommendations(recommendations, topics),
    attentionNeeded: buildAttention(topics, now),
    topics
  };
}

module.exports = { STATUS_BANDS, classifyMastery, buildAttention, buildTeacherSummary };
