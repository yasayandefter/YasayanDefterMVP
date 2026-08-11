"use strict";

const crypto = require("node:crypto");
const db = require("../db");
const memberships = require("./membershipRepository");
const { mapDatabaseError, page } = require("./errors");

function mapClassroom(row) { return row ? { id: row.id, name: row.name || "", schoolId: row.school_id || null, createdBy: row.created_by || null, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at || null, updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at || null } : null; }
async function createClassroom({ id = crypto.randomUUID(), name, schoolId, createdBy }, client) {
  const value = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (!value || !createdBy) throw new Error("INVALID_CLASSROOM_INPUT");
  const operation = async transactionClient => { try { const result = await transactionClient.query("INSERT INTO classrooms (id, school_id, name, created_by) VALUES ($1, $2, $3, $4) RETURNING id, school_id, name, created_by, created_at, updated_at", [id, schoolId, value, createdBy]); const classroom = mapClassroom(result.rows[0]); await memberships.addMembership({ classroomId: id, userId: createdBy, role: "TEACHER" }, transactionClient); return classroom; } catch (error) { throw mapDatabaseError(error, "CLASSROOM_CREATE_FAILED"); } };
  return client ? operation(client) : db.withTransaction(operation);
}
async function findById(id, client = db) { try { const result = await client.query("SELECT id, school_id, name, created_by, created_at, updated_at FROM classrooms WHERE id = $1", [id]); return mapClassroom(result.rows[0]); } catch (error) { throw mapDatabaseError(error, "CLASSROOM_LOOKUP_FAILED"); } }
async function listForUser(userId, options = {}, client = db) { const limit = page(options.limit); const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0); const result = await client.query("SELECT c.id, c.school_id, c.name, c.created_by, c.created_at, c.updated_at FROM classrooms c JOIN classroom_memberships m ON m.classroom_id = c.id WHERE m.user_id = $1 ORDER BY c.created_at DESC, c.id LIMIT $2 OFFSET $3", [userId, limit, offset]); return result.rows.map(mapClassroom); }
const listForTeacher = listForUser;
const listForStudent = listForUser;
async function updateName(id, name, client = db) { const value = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 120) : ""; if (!value) throw new Error("INVALID_CLASSROOM_NAME"); const result = await client.query("UPDATE classrooms SET name = $2, updated_at = NOW() WHERE id = $1 RETURNING id, school_id, name, created_by, created_at, updated_at", [id, value]); return mapClassroom(result.rows[0]); }
async function getSummarySourceData(classroomId, client = db) { const classroom = await findById(classroomId, client); if (!classroom) return null; const students = await client.query("SELECT s.id, s.user_id, s.display_name, s.created_at, s.updated_at FROM students s JOIN classroom_memberships m ON m.user_id = s.user_id WHERE m.classroom_id = $1 AND m.role = 'STUDENT' ORDER BY s.created_at, s.id", [classroomId]); return { classroom, students: students.rows }; }

module.exports = { name: "classrooms", mapClassroom, createClassroom, findById, listForUser, listForTeacher, listForStudent, updateName, getSummarySourceData };
