const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const store = require("../brain/classroomStore");
const profile = require("../brain/learningProfile");
const classroomProfile = require("../brain/classroomProfile");
const quizSessions = require("../brain/quizSessions");
const livingMemory = require("../brain/livingMemory");

store.resetForTests();
assert.equal(store.createClassroom(" ").error, "INVALID_NAME");
const created = store.createClassroom("7-A Fen Bilimleri");
assert.ok(created.classroom.id.startsWith("class_"));
const classroom = created.classroom;
assert.equal(store.createStudent(classroom.id, "").error, "INVALID_NAME");
const studentA = store.createStudent(classroom.id, "Ada Öğrenci").student;
const studentB = store.createStudent(classroom.id, "Bora Öğrenci").student;
assert.equal(store.listStudents(classroom.id).length, 2);
assert.equal(store.getStudent(studentA.id).displayName, "Ada Öğrenci");

const records = [
  { topic: "Mars", studentId: studentA.id, timesSearched: 4, updatedAt: "2026-08-10T00:00:00Z", keyConcepts: ["Gezegen"] },
  { topic: "DNA", studentId: studentB.id, timesSearched: 1, updatedAt: "2026-08-10T00:00:00Z", keyConcepts: ["Gen"] }
];
const profileA = profile.buildProfile(records.filter(item => item.studentId === studentA.id));
const profileB = profile.buildProfile(records.filter(item => item.studentId === studentB.id));
assert.equal(profileA.researchedTopics, 1);
assert.equal(profileB.researchedTopics, 1);
const summary = classroomProfile.buildClassroomSummary(classroom, [studentA, studentB], [profileA, profileB]);
assert.equal(summary.classroom.studentCount, 2);
assert.equal(summary.overview.totalResearchTopics, 2);
assert.equal(summary.students.length, 2);

const research = { query: "Mars", structuredContent: { keyFacts: [
  { text: "Mars, Güneş Sistemi'nde dördüncü sırada yer alan kayasal bir gezegendir.", concept: "Gezegen" },
  { text: "Mars'ın iki küçük uydusu Phobos ve Deimos'tur.", concept: "Uydular" },
  { text: "Mars atmosferi çoğunlukla karbondioksitten oluşur.", concept: "Atmosfer" }
] } };
const attempt = quizSessions.start({ research, count: 3 }, "", studentA.id);
assert.equal(quizSessions.answer(attempt.quiz.attemptId, attempt.quiz.questions[0].id, "x", false, studentB.id).error, "STUDENT_MISMATCH");
assert.equal(quizSessions.complete(attempt.quiz.attemptId, studentB.id).error, "STUDENT_MISMATCH");
const isolated = livingMemory.sanitizeRecords([{ topic: "Mars", studentId: studentA.id }, { topic: "Mars", studentId: studentB.id }]);
assert.equal(isolated.length, 2);

fs.writeFileSync(path.join(store.DATA_DIR, "classrooms.json"), "{broken", "utf8");
assert.deepEqual(store.classrooms(), []);
store.resetForTests();
console.log("PASS  classroom CRUD, student isolation, quiz isolation, summary ranking, and malformed storage fallback");
