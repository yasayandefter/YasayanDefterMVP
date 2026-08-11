"use strict";

const crypto = require("node:crypto");
const readline = require("node:readline");
const { getConfig } = require("../auth/config");
const { hashPassword } = require("../auth/password");
const users = require("../repositories/usersRepository");
const db = require("../db");

function ask(question) {
  if (process.env[`AUTH_${question.toUpperCase().replace(/[^A-Z]/g, "_")}`]) return Promise.resolve(process.env[`AUTH_${question.toUpperCase().replace(/[^A-Z]/g, "_")}`]);
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => input.question(`${question}: `, answer => { input.close(); resolve(answer); }));
}

(async () => {
  try {
    const config = getConfig();
    if (config.authMode !== "production") throw new Error("AUTH_PRODUCTION_REQUIRED");
    const email = await ask("teacher_email");
    const displayName = await ask("teacher_display_name");
    const rawPassword = await ask("teacher_password");
    const result = await db.withTransaction(async client => users.createTeacher({ id: crypto.randomUUID(), email, displayName, passwordHash: hashPassword(rawPassword) }, client));
    console.log(JSON.stringify({ ok: true, userId: result.id, role: result.role }));
  } catch (error) { console.error(JSON.stringify({ ok: false, code: error.message || "TEACHER_CREATE_FAILED", message: "Teacher hesabı oluşturulamadı." })); process.exitCode = 1; }
  finally { await db.closePool(); }
})();
