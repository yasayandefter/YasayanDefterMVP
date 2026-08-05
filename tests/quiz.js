const assert = require("node:assert/strict");
const quiz = require("../brain/quizEngine");

const research = {
  query: "Mars",
  structuredContent: {
    summary: "Mars, Güneş Sistemi'nde yer alan kayasal bir gezegendir.",
    keyConcepts: [{ term: "Gezegen" }],
    keyFacts: [
      { text: "Mars, Güneş Sistemi'nde dördüncü sırada yer alan kayasal bir gezegendir.", concept: "Mars", confidence: "high" },
      { text: "Mars'ın iki küçük uydusu Phobos ve Deimos'tur.", concept: "Uydular", confidence: "medium" },
      { text: "Mars atmosferi çoğunlukla karbondioksitten oluşur.", concept: "Atmosfer", confidence: "medium" },
      { text: "Mars yüzeyinde demir oksit bulunur.", concept: "Yüzey", confidence: "medium" },
      { text: "Mars'ta mevsimler yaşanır.", concept: "İklim", confidence: "low" }
    ]
  }
};

const easy = quiz.buildQuiz(research, { difficulty: "easy", count: 5, type: "multiple-choice" });
const medium = quiz.buildQuiz(research, { difficulty: "medium", count: 5, type: "multiple-choice" });
const hard = quiz.buildQuiz(research, { difficulty: "hard", count: 5, type: "multiple-choice" });
assert.equal(quiz.normalizeDifficulty("unknown"), "medium");
assert.equal(quiz.normalizeType("unknown"), "multiple-choice");
assert.ok(easy.questions.length <= 5);
assert.ok(medium.questions.length >= 3);
assert.ok(hard.questions.length <= 5);
assert.deepEqual(medium, quiz.buildQuiz(research, { difficulty: "medium", count: 5, type: "multiple-choice" }));
for (const item of medium.questions) {
  assert.ok(item.prompt && item.correctAnswer && item.explanation);
  assert.ok(item.options.length >= 2 && item.options.length <= 4);
  assert.equal(new Set(item.options.map(value => value.toLocaleLowerCase("tr-TR"))).size, item.options.length);
  assert.doesNotMatch(JSON.stringify(item), /\[object Object\]|undefined|null|<script>|Error/);
}

const trueFalse = quiz.buildQuiz(research, { difficulty: "medium", count: 5, type: "true-false" });
assert.ok(trueFalse.questions.every(item => item.type === "true-false" && item.options.length === 2));
const question = medium.questions[0];
const correct = quiz.evaluateAnswer(question, question.correctAnswer);
const wrong = quiz.evaluateAnswer(question, "Kesinlikle başka bir cevap");
assert.equal(correct.correct, true);
assert.equal(wrong.correct, false);
assert.equal(wrong.skipped, false);
const result = quiz.summarizeQuizResult(medium, [correct, wrong]);
assert.equal(result.correct, 1);
assert.equal(result.wrong, 1);
assert.equal(result.skipped, medium.questions.length - 2);
assert.ok(result.weakConcepts.length >= 1);
const retry = quiz.buildRetryQuiz(medium, result);
assert.equal(retry.questions.length, medium.questions.length - 1);
assert.equal(retry.retry, true);
const awarded = new Set();
assert.ok(quiz.calculateXp({ quizId: "attempt-1", difficulty: "medium", correct: 2, total: 2, percentage: 100 }, awarded).xp > 0);
assert.equal(quiz.calculateXp({ quizId: "attempt-1", difficulty: "medium", correct: 2, total: 2, percentage: 100 }, awarded).duplicate, true);
assert.equal(quiz.buildQuiz(null).questions.length, 0);
assert.equal(quiz.buildQuiz({ structuredContent: { keyFacts: [{ text: "Yarım bilgi" }] } }).questions.length, 0);

console.log("PASS  quiz generation, determinism, evaluation, explanations, retry, weak concepts, and XP guards");
