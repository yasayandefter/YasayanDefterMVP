const assert = require("node:assert/strict");
const sessions = require("../brain/quizSessions");

const research = {
  query: "Mars",
  structuredContent: {
    keyFacts: [
      { text: "Mars, Güneş Sistemi'nde dördüncü sırada yer alan kayasal bir gezegendir.", concept: "Gezegen" },
      { text: "Mars'ın iki küçük uydusu Phobos ve Deimos'tur.", concept: "Uydular" },
      { text: "Mars atmosferi çoğunlukla karbondioksitten oluşur.", concept: "Atmosfer" },
      { text: "Mars yüzeyinde demir oksit bulunur.", concept: "Yüzey" }
    ]
  }
};

const started = sessions.start({ research, count: 5, difficulty: "medium", type: "multiple-choice" });
assert.ok(started.quiz.attemptId);
assert.ok(started.quiz.questions.length >= 3);
assert.ok(started.quiz.questions.every(item => !Object.hasOwn(item, "correctAnswer") && !Object.hasOwn(item, "acceptedAnswers")));

const first = started.quiz.questions[0];
const privateSession = sessions.get(started.quiz.attemptId);
const correctAnswer = privateSession.quiz.questions.find(item => item.id === first.id).correctAnswer;
const answer = sessions.answer(started.quiz.attemptId, first.id, correctAnswer, false);
assert.equal(answer.result.correct, true);
assert.equal(sessions.answer(started.quiz.attemptId, first.id, correctAnswer, false).error, "DUPLICATE_ANSWER");

const second = started.quiz.questions[1];
assert.equal(sessions.answer(started.quiz.attemptId, second.id, "", true).result.skipped, true);
const summary = sessions.complete(started.quiz.attemptId);
assert.equal(summary.duplicate, false);
assert.equal(summary.summary.correct, 1);
assert.equal(summary.summary.skipped, started.quiz.questions.length - 1);
assert.ok(summary.summary.xpAwarded > 0);
const duplicate = sessions.complete(started.quiz.attemptId);
assert.equal(duplicate.duplicate, true);
assert.deepEqual(duplicate.summary, summary.summary);
assert.equal(sessions.answer(started.quiz.attemptId, first.id, correctAnswer).error, "ATTEMPT_COMPLETED");

const retry = sessions.start({ research, count: 5, difficulty: "medium", type: "multiple-choice" }, started.quiz.attemptId);
assert.ok(retry.quiz.questions.every(item => item.id !== first.id));
assert.equal(sessions.answer("missing", first.id, correctAnswer).error, "UNKNOWN_ATTEMPT");

console.log("PASS  server quiz sessions, hidden answers, duplicate guards, retry, and server XP");
