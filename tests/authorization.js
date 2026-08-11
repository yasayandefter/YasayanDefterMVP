"use strict";

const assert = require("node:assert/strict");
const authorization = require("../services/authorizationService");

const student = { userId: "student-user", role: "STUDENT", studentId: "student-a" };
const teacher = { userId: "teacher-user", role: "TEACHER" };
const user = { userId: "general-user", role: "USER", studentId: null };
const memberships = {
  async teacherCanAccessStudent(userId, studentId) { return userId === "teacher-user" && studentId === "student-a"; },
  async userCanAccessClassroom(userId, classroomId) { return userId === "teacher-user" && classroomId === "class-a"; }
};

(async () => {
  assert.equal(await authorization.canAccessStudent(student, "student-a", { memberships }), true);
  assert.equal(await authorization.canAccessStudent(student, "student-b", { memberships }), false);
  await assert.rejects(() => authorization.requireStudentAccess(student, "student-b", { memberships }), error => error.code === "FORBIDDEN");
  assert.equal(await authorization.canAccessStudent(teacher, "student-a", { memberships }), true);
  assert.equal(await authorization.canAccessStudent(teacher, "student-b", { memberships }), false);
  assert.throws(() => authorization.requireAuthenticated(null), error => error.code === "UNAUTHENTICATED");
  assert.throws(() => authorization.requireRole(student, "TEACHER"), error => error.code === "FORBIDDEN");
  assert.throws(() => authorization.requireRole(user, "TEACHER"), error => error.code === "FORBIDDEN");
  assert.equal(await authorization.canAccessStudent(user, "student-a", { memberships }), false);
  await assert.rejects(() => authorization.requireOwnStudentProfile({ userId: "unlinked", role: "STUDENT" }), error => error.code === "ACCOUNT_NOT_LINKED");
  assert.equal(await authorization.requireTeacherClassroom(teacher, "class-a", { memberships }), "class-a");
  await assert.rejects(() => authorization.requireTeacherClassroom(teacher, "class-b", { memberships }), error => error.code === "FORBIDDEN");
  await assert.rejects(() => authorization.requireClassroomAccess(student, "class-a", { memberships }), error => error.code === "FORBIDDEN");
  console.log("PASS  student ownership, teacher membership, role, classroom, unauthenticated, and missing-link authorization checks");
})().catch(error => { console.error(error); process.exitCode = 1; });
