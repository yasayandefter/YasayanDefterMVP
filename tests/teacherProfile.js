const assert = require("node:assert/strict");
const teacher = require("../brain/teacherProfile");

assert.equal(teacher.classifyMastery(0).key, "support");
assert.equal(teacher.classifyMastery(39).key, "support");
assert.equal(teacher.classifyMastery(40).key, "developing");
assert.equal(teacher.classifyMastery(69).key, "developing");
assert.equal(teacher.classifyMastery(70).key, "good");
assert.equal(teacher.classifyMastery(84).key, "good");
assert.equal(teacher.classifyMastery(85).key, "strong");
assert.equal(teacher.classifyMastery(100).key, "strong");

const summary = teacher.buildTeacherSummary({
  totalXP: 120, level: 2, accuracy: 62, completedQuizzes: 2, researchedTopics: 3, answeredQuestions: 8,
  strongConcepts: ["Gezegen"], weakConcepts: ["Atmosfer"], topicProgress: [
    { topic: "Mars", mastery: 90, accuracy: 88, quizAttempts: 2, lastStudiedAt: "2026-08-10T10:00:00Z", weakConcepts: [] },
    { topic: "Fotosentez", mastery: 55, accuracy: 60, quizAttempts: 1, lastStudiedAt: "2026-08-09T10:00:00Z", weakConcepts: ["Işık reaksiyonları"] },
    { topic: "DNA", mastery: 30, accuracy: 35, quizAttempts: 2, lastStudiedAt: "2026-07-01T10:00:00Z", weakConcepts: ["Baz eşleşmesi"] }
  ]
}, [
  { type: "weak-concept", topic: "Atmosfer" },
  { type: "advanced", topic: "Mars" }
], new Date("2026-08-11T00:00:00Z"));

assert.equal(summary.overview.totalXP, 120);
assert.equal(summary.learningStatus.strongTopics[0].topic, "Mars");
assert.equal(summary.learningStatus.developingTopics[0].topic, "Fotosentez");
assert.equal(summary.learningStatus.weakTopics[0].topic, "DNA");
assert.ok(summary.attentionNeeded.some(item => item.priority === "high" && item.topic === "DNA"));
assert.ok(summary.recommendations.some(item => item.text.includes("Atmosfer")));
assert.deepEqual(teacher.buildTeacherSummary(null).overview, { totalXP: 0, level: 1, overallAccuracy: 0, completedQuizzes: 0, researchedTopicCount: 0, totalAnsweredQuestions: 0 });
assert.doesNotThrow(() => JSON.stringify(teacher.buildTeacherSummary({ topicProgress: [null, undefined, {}] })));

console.log("PASS  teacher summary, mastery boundaries, attention rules, recommendations, and empty data");
