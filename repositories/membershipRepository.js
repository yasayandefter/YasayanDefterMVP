"use strict";

const db = require("../db");

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

module.exports = { name: "memberships", findStudentByUserId, userCanAccessClassroom, teacherCanAccessStudent, studentBelongsToClassroom, listClassroomsForUser };
