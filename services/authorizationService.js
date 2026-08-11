"use strict";

const memberships = require("../repositories/membershipRepository");

function authorizationError(code) { const error = new Error(code); error.code = code; return error; }

function requireAuthenticated(auth) {
  if (!auth || !auth.userId || !auth.role) throw authorizationError("UNAUTHENTICATED");
  return auth;
}

function requireRole(auth, role) {
  requireAuthenticated(auth);
  if (auth.role !== role) throw authorizationError("FORBIDDEN");
  return auth;
}

async function canAccessStudent(auth, studentId, dependencies = {}) {
  requireAuthenticated(auth);
  const repository = dependencies.memberships || memberships;
  if (!studentId) return false;
  if (auth.role === "STUDENT") return Boolean(auth.studentId && auth.studentId === studentId);
  if (auth.role === "TEACHER") return repository.teacherCanAccessStudent(auth.userId, studentId, dependencies.client);
  return false;
}

async function requireStudentAccess(auth, studentId, dependencies = {}) {
  if (!(await canAccessStudent(auth, studentId, dependencies))) throw authorizationError("FORBIDDEN");
  return studentId;
}

async function requireOwnStudentProfile(auth, dependencies = {}) {
  requireRole(auth, "STUDENT");
  if (!auth.studentId) throw authorizationError("ACCOUNT_NOT_LINKED");
  return auth.studentId;
}

async function requireClassroomAccess(auth, classroomId, dependencies = {}) {
  requireAuthenticated(auth);
  const repository = dependencies.memberships || memberships;
  if (!classroomId || !(await repository.userCanAccessClassroom(auth.userId, classroomId, dependencies.client))) throw authorizationError("FORBIDDEN");
  return classroomId;
}

async function requireTeacherClassroom(auth, classroomId, dependencies = {}) {
  requireRole(auth, "TEACHER");
  return requireClassroomAccess(auth, classroomId, dependencies);
}

async function listAuthorizedClassrooms(auth, dependencies = {}) {
  requireAuthenticated(auth);
  const repository = dependencies.memberships || memberships;
  return repository.listClassroomsForUser(auth.userId, dependencies.client);
}

module.exports = { authorizationError, requireAuthenticated, requireRole, canAccessStudent, requireStudentAccess, requireOwnStudentProfile, requireClassroomAccess, requireTeacherClassroom, listAuthorizedClassrooms };
