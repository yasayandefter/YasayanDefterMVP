"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const { createJsonStore } = require("./storage/jsonStore");

const DATA_DIR = process.env.YASAYAN_CLASSROOM_DATA_DIR || path.join(__dirname, "..", "data");
const CLASSROOMS_FILE = path.join(DATA_DIR, "classrooms.json");
const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
const LIMITS = Object.freeze({ classroomName: 120, studentName: 100 });
const classroomStore = createJsonStore(CLASSROOMS_FILE, { expected: "array", fallback: [] });
const studentStore = createJsonStore(STUDENTS_FILE, { expected: "array", fallback: [] });

function ensureFiles() { classroomStore.read(); studentStore.read(); }
function clean(value, limit) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : ""; }
function id(prefix) { return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`; }
function rawClassrooms() { return classroomStore.read().value; }
function rawStudents() { return studentStore.read().value; }
function classrooms() {
  const validStudentIds = new Set(students().map(item => item.id));
  return rawClassrooms().filter(item => item && typeof item.id === "string").map(item => ({ id: item.id, name: clean(item.name, LIMITS.classroomName), createdAt: item.createdAt, updatedAt: item.updatedAt, studentIds: Array.isArray(item.studentIds) ? item.studentIds.filter(value => typeof value === "string" && validStudentIds.has(value)) : [] }));
}
function students() { return rawStudents().filter(item => item && typeof item.id === "string").map(item => ({ id: item.id, displayName: clean(item.displayName, LIMITS.studentName), classroomId: clean(item.classroomId, 100), createdAt: item.createdAt, updatedAt: item.updatedAt })); }
function createClassroom(name) { const value = clean(name, LIMITS.classroomName); if (!value) return { error: "INVALID_NAME" }; const now = new Date().toISOString(); const item = { id: id("class"), name: value, createdAt: now, updatedAt: now, studentIds: [] }; const result = classroomStore.update(list => [...list, item]); return result.ok ? { classroom: item } : { error: "STORAGE_FAILED" }; }
function getClassroom(classroomId) { return classrooms().find(item => item.id === classroomId) || null; }
function createStudent(classroomId, displayName) { const classroom = getClassroom(classroomId); if (!classroom) return { error: "CLASSROOM_NOT_FOUND" }; const value = clean(displayName, LIMITS.studentName); if (!value) return { error: "INVALID_NAME" }; const now = new Date().toISOString(); const item = { id: id("student"), displayName: value, classroomId, createdAt: now, updatedAt: now }; const studentWrite = studentStore.update(list => [...list, item]); if (!studentWrite.ok) return { error: "STORAGE_FAILED" }; const classroomWrite = classroomStore.update(list => list.map(entry => entry.id === classroomId ? { ...entry, studentIds: [...new Set([...(Array.isArray(entry.studentIds) ? entry.studentIds : []), item.id])], updatedAt: now } : entry)); return classroomWrite.ok ? { student: item } : { error: "STORAGE_FAILED" }; }
function getStudent(studentId) { return students().find(item => item.id === studentId) || null; }
function listStudents(classroomId) { return students().filter(item => item.classroomId === classroomId); }
function updateStudent(studentId, displayName) { const student = getStudent(studentId); if (!student) return { error: "STUDENT_NOT_FOUND" }; const value = clean(displayName, LIMITS.studentName); if (!value) return { error: "INVALID_NAME" }; const updated = { ...student, displayName: value, updatedAt: new Date().toISOString() }; return studentStore.update(list => list.map(item => item.id === studentId ? updated : item)).ok ? { student: updated } : { error: "STORAGE_FAILED" }; }
function resetForTests() { classroomStore.write([]); studentStore.write([]); }

module.exports = { DATA_DIR, LIMITS, ensureFiles, classrooms, students, createClassroom, getClassroom, createStudent, getStudent, listStudents, updateStudent, resetForTests, CLASSROOMS_FILE, STUDENTS_FILE };
