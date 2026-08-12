"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "yasayan-pilot-restart-"));
const dataDir = path.join(root, "data");
const port = 32000 + (process.pid % 500);
const env = { ...process.env, PORT: String(port), ACCESS_MODE: "local-pilot", AUTH_MODE: "local", STORAGE_MODE: "json", DATABASE_URL: "", APP_ORIGIN: "", YASAYAN_MEMORY_FILE: path.join(root, "memory.json"), YASAYAN_LEARNING_MEMORY_FILE: path.join(root, "yasayan_deefter_memory.json"), YASAYAN_CLASSROOM_DATA_DIR: dataDir, YASAYAN_QUIZ_ATTEMPTS_FILE: path.join(dataDir, "quiz-attempts.json") };

function request(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method, headers: body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, res => {
      let text = "";
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => { try { resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }); } catch (error) { reject(error); } });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
function start() {
  const child = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.resume(); child.stderr.resume();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SERVER_START_TIMEOUT")), 10000);
    const poll = async () => { try { const response = await request("GET", "/api/status"); if (response.status === 200) { clearTimeout(timer); resolve(child); return; } } catch (_) {} setTimeout(poll, 100); };
    poll();
    child.once("exit", code => { if (code && !child.killed) { clearTimeout(timer); reject(new Error(`SERVER_EXIT_${code}`)); } });
  });
}
function stop(child) {
  return new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once("exit", resolve); child.kill("SIGTERM"); setTimeout(() => { if (child.exitCode === null) child.kill(); resolve(); }, 5000).unref(); });
}

(async () => {
  let child;
  try {
    child = await start();
    const created = await request("POST", "/api/classrooms", { name: "Fixture Classroom" });
    assert.equal(created.status, 201); const classroomId = created.body.classroom.id;
    const student = await request("POST", `/api/classrooms/${encodeURIComponent(classroomId)}/students`, { displayName: "Fixture Student" });
    assert.equal(student.status, 201); const studentId = student.body.student.id;
    await stop(child); child = await start();
    const classrooms = await request("GET", "/api/classrooms");
    assert.equal(classrooms.status, 200); assert.ok(classrooms.body.classrooms.some(item => item.id === classroomId));
    const students = await request("GET", `/api/classrooms/${encodeURIComponent(classroomId)}/students`);
    assert.equal(students.status, 200); assert.ok(students.body.students.some(item => item.id === studentId));
    console.log("PASS  pilot process restart preserves synthetic classroom and student storage");
  } finally { if (child) await stop(child); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
