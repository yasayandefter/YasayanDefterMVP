"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  learning progress HTTP E2E: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
const username = `progress_${crypto.randomBytes(6).toString("hex")}`; const password = "Progress-test-password!";
let child; let userId;
function start(base, port) { child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), ACCESS_MODE: "authenticated", AUTH_MODE: "production", STORAGE_MODE: "postgres", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_ORIGIN: base, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore"] }); }
async function stop() { if (!child || child.exitCode !== null) return; child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
async function waitFor(base) { for (let index=0; index<80; index+=1) { try { if ((await fetch(base+"/api/status")).ok) return; } catch (_) {} await new Promise(resolve=>setTimeout(resolve,100)); } throw new Error("SERVER_NOT_READY"); }
async function json(base, path, options={}) { const response=await fetch(base+path,options); const body=await response.json(); return { response, body }; }

(async()=>{
  const port=38000+crypto.randomInt(8000); const base=`http://127.0.0.1:${port}`; start(base,port); await waitFor(base);
  let result=await json(base,"/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify({username,password})}); assert.equal(result.response.status,201); userId=result.body.user.id; const cookie=String(result.response.headers.get("set-cookie")||"").split(";")[0];
  result=await json(base,"/api/progress",{headers:{Cookie:cookie}}); assert.equal(result.response.status,200); assert.equal(result.body.profile.streak.current,0); assert.equal(result.body.profile.weeklyGoal.completed,0); assert.equal(result.body.profile.weeklyGoal.target,5);
  result=await json(base,"/api/research?q="+encodeURIComponent("Venüs gezegeni"),{headers:{Cookie:cookie,"X-Research-Request-Id":crypto.randomUUID()}}); assert.equal(result.response.status,200);
  result=await json(base,"/api/progress",{headers:{Cookie:cookie}}); assert.equal(result.body.profile.streak.current,1); assert.equal(result.body.profile.streak.activeToday,true); assert.equal(result.body.profile.weeklyGoal.completed,1); assert.equal(result.body.profile.weeklyGoal.remaining,4);
  await stop(); start(base,port); await waitFor(base);
  result=await json(base,"/api/auth/session",{headers:{Cookie:cookie}}); assert.equal(result.body.authenticated,true);
  result=await json(base,"/api/progress",{headers:{Cookie:cookie}}); assert.equal(result.body.profile.streak.current,1); assert.equal(result.body.profile.weeklyGoal.completed,1);
  console.log("PASS  PostgreSQL HTTP register, authoritative zero state, first research, streak/weekly target, restart session, and persistence");
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1}).finally(async()=>{await stop();try{if(userId){await pool.query("DELETE FROM research_activity_events WHERE owner_user_id=$1",[userId]);await pool.query("DELETE FROM memory_records WHERE owner_user_id=$1",[userId]);await pool.query("DELETE FROM sessions WHERE user_id=$1",[userId]);await pool.query("DELETE FROM users WHERE id=$1",[userId]);}else await pool.query("DELETE FROM users WHERE username=$1",[username]);}finally{await pool.end();}});
