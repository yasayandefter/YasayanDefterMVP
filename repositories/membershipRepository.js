"use strict";

const db = require("../db");
const crypto = require("node:crypto");
const { mapDatabaseError, page } = require("./errors");

async function findStudentByUserId(userId, client = db) {
  const result = await client.query("SELECT id, user_id, display_name FROM students WHERE user_id = $1", [userId]);
  return result.rows[0] || null;
}

async function userCanAccessClassroom(userId, classroomId, client = db) {
  const result = await client.query("SELECT 1 FROM classroom_memberships WHERE user_id = $1 AND classroom_id = $2 LIMIT 1", [userId, classroomId]);
  return Boolean(result.rows[0]);
}

async function teacherCanAccessStudent(userId, studentId, client = db) {
  const result = await client.query(`
    SELECT 1
    FROM classroom_memberships teacher_membership
    JOIN classroom_memberships student_membership
      ON student_membership.classroom_id = teacher_membership.classroom_id
     AND student_membership.role = 'STUDENT'
    JOIN students student ON student.user_id = student_membership.user_id
    WHERE teacher_membership.user_id = $1
      AND teacher_membership.role = 'TEACHER'
      AND student.id = $2
    LIMIT 1`, [userId, studentId]);
  return Boolean(result.rows[0]);
}

async function studentBelongsToClassroom(studentId, classroomId, client = db) {
  const result = await client.query(`
    SELECT 1
    FROM classroom_memberships membership
    JOIN students student ON student.user_id = membership.user_id
    WHERE membership.classroom_id = $1
      AND membership.role = 'STUDENT'
      AND student.id = $2
    LIMIT 1`, [classroomId, studentId]);
  return Boolean(result.rows[0]);
}

async function listClassroomsForUser(userId, client = db) {
  const result = await client.query("SELECT classroom_id, role FROM classroom_memberships WHERE user_id = $1 ORDER BY classroom_id", [userId]);
  return result.rows;
}

async function addMembership({ id = crypto.randomUUID(), classroomId, userId, role }, client = db) {
  if (!["STUDENT", "TEACHER"].includes(role)) throw new Error("INVALID_MEMBERSHIP_ROLE");
  try { const result = await client.query("INSERT INTO classroom_memberships (id, classroom_id, user_id, role) VALUES ($1, $2, $3, $4) ON CONFLICT (classroom_id, user_id, role) DO NOTHING RETURNING id, classroom_id, user_id, role, created_at", [id, classroomId, userId, role]); return result.rows[0] || null; } catch (error) { throw mapDatabaseError(error, "MEMBERSHIP_CREATE_FAILED"); }
}
async function hasMembership(userId, classroomId, client = db) { return userCanAccessClassroom(userId, classroomId, client); }
async function hasRole(userId, classroomId, role, client = db) { const result = await client.query("SELECT 1 FROM classroom_memberships WHERE user_id = $1 AND classroom_id = $2 AND role = $3 LIMIT 1", [userId, classroomId, role]); return Boolean(result.rows[0]); }
async function findSharedClassrooms(userA, userB, client = db) { const result = await client.query("SELECT DISTINCT classroom_id FROM classroom_memberships WHERE user_id = $1 INTERSECT SELECT classroom_id FROM classroom_memberships WHERE user_id = $2 ORDER BY classroom_id", [userA, userB]); return result.rows.map(row => row.classroom_id); }
async function listClassroomMembers(classroomId, options = {}, client = db) { const limit = page(options.limit); const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0); const result = await client.query("SELECT user_id, role, created_at FROM classroom_memberships WHERE classroom_id = $1 ORDER BY created_at, user_id LIMIT $2 OFFSET $3", [classroomId, limit, offset]); return result.rows; }
const listUserClassrooms = listClassroomsForUser;

module.exports = { name: "memberships", findStudentByUserId, userCanAccessClassroom, teacherCanAccessStudent, studentBelongsToClassroom, listClassroomsForUser, listUserClassrooms, addMembership, hasMembership, hasRole, findSharedClassrooms, listClassroomMembers };
