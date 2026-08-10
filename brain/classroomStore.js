"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const CLASSROOMS_FILE = path.join(DATA_DIR, "classrooms.json");
const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
const LIMITS = Object.freeze({ classroomName: 120, studentName: 100 });

function ensureFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const file of [CLASSROOMS_FILE, STUDENTS_FILE]) if (!fs.existsSync(file)) fs.writeFileSync(file, "[]", "utf8");
}

function read(file) {
  try { ensureFiles(); const value = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(value) ? value : []; } catch (_) { return []; }
}

function write(file, value) {
  try { ensureFiles(); const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`; fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8"); fs.renameSync(temporary, file); return true; } catch (_) { return false; }
}

function clean(value, limit) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : ""; }
function id(prefix) { return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`; }
function classrooms() { return read(CLASSROOMS_FILE).filter(item => item && typeof item === "object" && typeof item.id === "string").map(item => ({ id: item.id, name: clean(item.name, LIMITS.classroomName), createdAt: item.createdAt, updatedAt: item.updatedAt, studentIds: Array.isArray(item.studentIds) ? item.studentIds.filter(value => typeof value === "string") : [] })); }
function students() { return read(STUDENTS_FILE).filter(item => item && typeof item === "object" && typeof item.id === "string").map(item => ({ id: item.id, displayName: clean(item.displayName, LIMITS.studentName), classroomId: clean(item.classroomId, 100), createdAt: item.createdAt, updatedAt: item.updatedAt })); }
function createClassroom(name) { const value = clean(name, LIMITS.classroomName); if (!value) return { error: "INVALID_NAME" }; const now = new Date().toISOString(); const item = { id: id("class"), name: value, createdAt: now, updatedAt: now, studentIds: [] }; const list = classrooms(); list.push(item); return write(CLASSROOMS_FILE, list) ? { classroom: item } : { error: "STORAGE_FAILED" }; }
function getClassroom(classroomId) { return classrooms().find(item => item.id === classroomId) || null; }
function createStudent(classroomId, displayName) { const classroom = getClassroom(classroomId); if (!classroom) return { error: "CLASSROOM_NOT_FOUND" }; const value = clean(displayName, LIMITS.studentName); if (!value) return { error: "INVALID_NAME" }; const now = new Date().toISOString(); const item = { id: id("student"), displayName: value, classroomId, createdAt: now, updatedAt: now }; const allStudents = students(); allStudents.push(item); classroom.studentIds.push(item.id); classroom.updatedAt = now; const ok = write(STUDENTS_FILE, allStudents) && write(CLASSROOMS_FILE, classrooms().map(entry => entry.id === classroomId ? classroom : entry)); return ok ? { student: item } : { error: "STORAGE_FAILED" }; }
function getStudent(studentId) { return students().find(item => item.id === studentId) || null; }
function listStudents(classroomId) { return students().filter(item => item.classroomId === classroomId); }
function updateStudent(studentId, displayName) { const student = getStudent(studentId); if (!student) return { error: "STUDENT_NOT_FOUND" }; const value = clean(displayName, LIMITS.studentName); if (!value) return { error: "INVALID_NAME" }; student.displayName = value; student.updatedAt = new Date().toISOString(); return write(STUDENTS_FILE, students().map(item => item.id === studentId ? student : item)) ? { student } : { error: "STORAGE_FAILED" }; }
function resetForTests() { write(CLASSROOMS_FILE, []); write(STUDENTS_FILE, []); }

module.exports = { DATA_DIR, LIMITS, ensureFiles, classrooms, students, createClassroom, getClassroom, createStudent, getStudent, listStudents, updateStudent, resetForTests };
