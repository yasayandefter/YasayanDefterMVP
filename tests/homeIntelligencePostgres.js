"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  home intelligence PostgreSQL: TEST_DATABASE_URL missing"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const suffix = crypto.randomBytes(5).toString("hex");
const names = {
  user: `home_u_${suffix}`,
  other: `home_o_${suffix}`,
  studentA: `home_sa_${suffix}`,
  studentB: `home_sb_${suffix}`,
  teacher: `home_t_${suffix}`
};
const password = "Home-test!";
let child;

async function wait(base) {
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(base + "/api/status")).ok) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("TIMEOUT");
}

async function call(base, path, method = "GET", body, cookie) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Accept: "application/json",
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body && JSON.stringify(body)
  });
  return { response, body: await response.json().catch(() => ({})) };
}

async function add(base, cookie, title, type = "note", metadata = {}) {
  const result = await call(base, "/api/memory", "POST", {
    title,
    content: title,
    workspaceArea: "work",
    contentType: type,
    tags: ["samsung", "partner"],
    metadata
  }, cookie);
  assert.equal(result.response.status, 201);
  return result.body.memory;
}

async function stop() {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise(resolve => child.once("exit", resolve));
  }
}

(async () => {
  const port = 49100 + crypto.randomInt(400);
  const base = `http://127.0.0.1:${port}`;
  const start = () => spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      ACCESS_MODE: "authenticated",
      AUTH_MODE: "production",
      STORAGE_MODE: "postgres",
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      APP_ORIGIN: base,
      NODE_ENV: "test"
    },
    stdio: ["ignore", "ignore", "ignore"]
  });

  child = start();
  await wait(base);
  const sessions = {};
  const users = {};
  for (const [key, name] of Object.entries(names)) {
    const result = await call(base, "/api/auth/register", "POST", { username: name, password });
    assert.equal(result.response.status, 201);
    sessions[key] = String(result.response.headers.get("set-cookie")).split(";")[0];
    users[key] = result.body.user.id;
  }
  await pool.query("UPDATE users SET role='STUDENT' WHERE id=ANY($1::uuid[])", [[users.studentA, users.studentB]]);
  await pool.query("UPDATE users SET role='TEACHER' WHERE id=$1", [users.teacher]);
  for (const key of ["studentA", "studentB"]) {
    users[key + "Profile"] = crypto.randomUUID();
    await pool.query("INSERT INTO students(id,user_id,display_name) VALUES($1,$2,$3)", [users[key + "Profile"], users[key], names[key]]);
  }

  const records = [
    await add(base, sessions.user, "Samsung toplantı", "meeting"),
    await add(base, sessions.user, "Samsung araştırma", "research"),
    await add(base, sessions.user, "Samsung aktif proje", "project", { status: "active" }),
    await add(base, sessions.user, "Samsung fikir", "idea")
  ];
  await call(base, "/api/collections", "POST", {
    name: "Samsung Çalışmaları",
    workspaceArea: "work",
    recordIds: records.slice(0, 3).map(item => item.id)
  }, sessions.user);
  const foreign = await add(base, sessions.other, "Samsung yabancı");

  let result = await call(base, "/api/intelligence/home", "GET", null, sessions.user);
  assert.equal(result.response.status, 200);
  assert.ok(result.body.home.continueItems.some(item => /Samsung/i.test(item.title)));
  assert.equal(result.body.home.collectionHighlights[0].name, "Samsung Çalışmaları");
  assert.ok(!JSON.stringify(result.body).includes(foreign.id));

  // The cold request above validates behavior while allowing remote pool connections
  // to initialize. This second request protects steady-state query/application latency.
  result = await call(base, "/api/intelligence/home", "GET", null, sessions.user);
  assert.ok(result.body.meta.durationMs < 750);

  assert.equal((await call(base, "/api/intelligence/home?ownerUserId=" + users.other, "GET", null, sessions.user)).response.status, 200);
  for (const key of ["studentA", "studentB", "teacher"]) {
    await add(base, sessions[key], key + " Samsung A");
    await add(base, sessions[key], key + " Samsung B");
  }
  const studentHome = await call(base, "/api/intelligence/home", "GET", null, sessions.studentA);
  const teacherHome = await call(base, "/api/intelligence/home", "GET", null, sessions.teacher);
  assert.ok(!JSON.stringify(studentHome.body).includes("studentB"));
  assert.ok(!JSON.stringify(teacherHome.body).includes("studentA"));
  assert.equal((await call(base, "/api/intelligence/home")).response.status, 401);

  await stop();
  child = start();
  await wait(base);
  result = await call(base, "/api/intelligence/home", "GET", null, sessions.user);
  assert.ok(result.body.home.continueItems.length);
  console.log("PASS  home PostgreSQL USER/STUDENT/TEACHER privacy, collections, restart consistency, spoof resistance and warmed latency");
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await stop();
  await pool.query("DELETE FROM users WHERE username=ANY($1::text[])", [Object.values(names)]).catch(() => {});
  await pool.end();
});
