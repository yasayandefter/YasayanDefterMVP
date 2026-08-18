"use strict";

const { getConfig } = require("../auth/config");
const authorization = require("../services/authorizationService");
const logger = require("../brain/logger");

function requestValue(req, name) {
  return String(req.query?.[name] || req.body?.[name] || "").trim();
}

function sendError(res, error) {
  const code = error?.code || "FORBIDDEN";
  logger.warn("authorization.denied", { requestId: res.req?.requestId, code, method: res.req?.method, path: res.req?.path });
  const status = code === "UNAUTHENTICATED" ? 401 : code === "RESOURCE_NOT_FOUND" ? 404 : 403;
  const messages = { UNAUTHENTICATED: "Oturum açmanız gerekiyor.", FORBIDDEN: "Bu kaynağa erişim yetkiniz yok.", ACCOUNT_NOT_LINKED: "Hesabınız bir öğrenci profiline bağlı değil.", RESOURCE_NOT_FOUND: "Kaynak bulunamadı.", STUDENT_CONTEXT_REQUIRED: "Yetkili öğrenci bağlamı belirtilmelidir." };
  return res.status(status).json({ ok: false, error: { code, message: messages[code] || messages.FORBIDDEN }, requestId: res.req?.requestId });
}

async function authorizationGuard(req, res, next) {
  let config;
  try { config = getConfig(); } catch (_) { return sendError(res, { code: "UNAUTHENTICATED" }); }
  if (!req.path.startsWith("/api")) return next();
  if (req.path.startsWith("/api/auth") || req.path === "/api/status" || req.path === "/api/health") return next();
  const demoRequested = config.accessMode === "public-demo" || String(req.get?.("x-demo-mode") || "").toLowerCase() === "true";
  const demoSafe = req.path === "/api/research" || req.path.startsWith("/api/quiz/");
  if (demoRequested && demoSafe) { req.demo = true; req.demoSession = String(req.get?.("x-demo-session") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "anonymous"; return next(); }
  if (config.accessMode === "public-demo") return sendError(res, { code: "UNAUTHENTICATED" });
  if (config.authMode !== "production") return next();
  try {
    authorization.requireAuthenticated(req.auth);
    const path = req.path;
    if (path.startsWith("/api/teacher")) authorization.requireRole(req.auth, "TEACHER");
    if (path === "/api/teacher/summary") {
      const studentId = requestValue(req, "studentId");
      if (!studentId) throw authorization.authorizationError("STUDENT_CONTEXT_REQUIRED");
      await authorization.requireStudentAccess(req.auth, studentId);
    }
    if (path === "/api/classrooms" && req.method === "GET") req.authorizedClassrooms = await authorization.listAuthorizedClassrooms(req.auth);
    if (path === "/api/classrooms" && req.method === "POST") authorization.requireRole(req.auth, "TEACHER");
    if (path.startsWith("/api/classrooms/")) {
      const classroomId = path.split("/")[3];
      if (req.method === "POST" && path.endsWith("/students")) await authorization.requireTeacherClassroom(req.auth, classroomId);
      else await authorization.requireClassroomAccess(req.auth, classroomId);
    }
    if (path.startsWith("/api/students/")) await authorization.requireStudentAccess(req.auth, path.split("/")[3]);
    const studentId = requestValue(req, "studentId");
    if (path.startsWith("/api/quiz/")) {
      if (req.auth.role === "STUDENT") await authorization.requireOwnStudentProfile(req.auth);
      else if (req.auth.role !== "USER") throw authorization.authorizationError("FORBIDDEN");
      if (studentId && studentId !== req.auth.studentId) throw authorization.authorizationError("FORBIDDEN");
    } else if (path.startsWith("/api/progress") || path.startsWith("/api/recommendations") || path.startsWith("/api/memory")) {
      const ownMemoryDelete = req.method === "DELETE" && /^\/api\/memory\/[^/]+$/.test(path);
      if (req.auth.role === "USER") { if (studentId && !ownMemoryDelete) throw authorization.authorizationError("FORBIDDEN"); }
      else if (req.auth.role === "STUDENT") await authorization.requireOwnStudentProfile(req.auth);
      else if (req.auth.role !== "TEACHER") throw authorization.authorizationError("FORBIDDEN");
      else if (studentId && req.method !== "GET") throw authorization.authorizationError("FORBIDDEN");
      else if (studentId) await authorization.requireStudentAccess(req.auth, studentId);
    }
    if (path.startsWith("/api/session/student")) {
      if (req.auth.role === "STUDENT") await authorization.requireOwnStudentProfile(req.auth);
      else {
        const sessionStudent = requestValue(req, "studentId");
        if (!sessionStudent) throw authorization.authorizationError("STUDENT_CONTEXT_REQUIRED");
        await authorization.requireStudentAccess(req.auth, sessionStudent);
      }
    }
    if (path === "/api/research" && req.auth.role === "STUDENT" && req.auth.studentId && studentId && studentId !== req.auth.studentId) throw authorization.authorizationError("FORBIDDEN");
    return next();
  } catch (error) { return sendError(res, error); }
}

module.exports = { authorizationGuard, requestValue };
