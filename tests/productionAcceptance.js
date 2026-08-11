"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const password = require("../auth/password");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  Production acceptance: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
const id = () => crypto.randomUUID(); const suffix = crypto.randomBytes(5).toString("hex");
const ids = { school:id(), user:id(), student:id(), classroom:id(), attempt:id() };
const fixture = { email:`acceptance-${suffix}@example.test`, password:"Phase7-acceptance-password!" };
let children = [];
const baseEnv = port => ({ ...process.env, NODE_ENV:"production", AUTH_MODE:"production", STORAGE_MODE:"postgres", DATABASE_URL:process.env.TEST_DATABASE_URL, APP_ORIGIN:`http://localhost:${port}`, PORT:String(port), LOG_LEVEL:"info" });
function safeOutput(value) { const text=String(value||""); assert.equal(/postgres(?:ql)?:\/\//i.test(text),false); assert.equal(text.includes(process.env.TEST_DATABASE_URL),false); assert.equal(text.includes(fixture.password),false); return text; }
async function port() { return new Promise((resolve,reject)=>{const s=net.createServer();s.once("error",reject);s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p))})}); }
function start(env) { const child=spawn(process.execPath,["server.js"],{cwd:process.cwd(),env,stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",x=>output+=x);child.stderr.on("data",x=>output+=x);child.output=()=>safeOutput(output);children.push(child);return child; }
async function wait(base, expected=200) { for(let i=0;i<80;i+=1){try{const r=await fetch(base+"/api/status");if(r.status===expected)return r}catch(_){}await new Promise(r=>setTimeout(r,100))}throw new Error("SERVER_NOT_READY"); }
async function stop(child, signal) { if(child.exitCode!==null)return {code:child.exitCode,signal:null};child.kill(signal);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("SHUTDOWN_TIMEOUT")),8000);child.once("exit",(code,exitSignal)=>{clearTimeout(timer);resolve({code,signal:exitSignal})})}); }
function assertStopped(result, expectedSignal) { assert.equal(result.code===0 || result.signal===expectedSignal,true); }
async function call(base,path,options={}) { const response=await fetch(base+path,options);const text=await response.text();safeOutput(text);let body={};try{body=JSON.parse(text)}catch(_){}return{response,body,text}; }
function cookie(response){return String(response.headers.get("set-cookie")||"").split(";")[0]}
async function seed(){const hash=password.hashPassword(fixture.password);await pool.query("INSERT INTO schools(id,name) VALUES($1,'Acceptance School')",[ids.school]);await pool.query("INSERT INTO users(id,role,email,display_name,password_hash,status) VALUES($1,'TEACHER',$2,'Acceptance Teacher',$3,'ACTIVE')",[ids.user,fixture.email,hash]);await pool.query("INSERT INTO students(id,user_id,display_name) VALUES($1,NULL,'Acceptance Student')",[ids.student]);await pool.query("INSERT INTO classrooms(id,school_id,name,created_by) VALUES($1,$2,'Acceptance Classroom',$3)",[ids.classroom,ids.school,ids.user]);await pool.query("INSERT INTO classroom_memberships(id,classroom_id,user_id,role) VALUES($1,$2,$3,'TEACHER')",[id(),ids.classroom,ids.user]);}
async function cleanup(){await pool.query("DELETE FROM xp_events WHERE student_id=$1",[ids.student]);await pool.query("DELETE FROM quiz_attempts WHERE student_id=$1",[ids.student]);await pool.query("DELETE FROM memory_records WHERE student_id=$1",[ids.student]);await pool.query("DELETE FROM classrooms WHERE id=$1",[ids.classroom]);await pool.query("DELETE FROM students WHERE id=$1",[ids.student]);await pool.query("DELETE FROM users WHERE id=$1",[ids.user]);await pool.query("DELETE FROM schools WHERE id=$1",[ids.school]);}

(async()=>{
  const identity=await pool.query("SELECT current_database() database,current_user username");assert.equal(identity.rows[0].database,"yasayan_defter_test");assert.equal(identity.rows[0].username,"yasayan_defter_test");await seed();
  const p=await port(),base=`http://localhost:${p}`;let server=start(baseEnv(p));let health=await wait(base);let status=await health.json();assert.equal(status.storageMode,"postgres");assert.equal(status.storageHealth,"ok");assert.equal(JSON.stringify(status).includes("DATABASE_URL"),false);
  for(const [name,value] of [["x-content-type-options","nosniff"],["x-frame-options","SAMEORIGIN"],["referrer-policy","strict-origin-when-cross-origin"]])assert.equal(health.headers.get(name),value);assert.match(health.headers.get("permissions-policy")||"",/camera=\(\)/);assert.equal(health.headers.get("cache-control"),"no-store");
  for(const path of ["/memory.json","/yasayan_deefter_memory.json","/data/students.json","/backups/manifest.json","/.env","/.git/config","/package-lock.json","/server.js"])assert.equal((await fetch(base+path)).status,404);
  for(let i=0;i<3;i+=1)assert.equal((await call(base,"/api/auth/login",{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({identifier:fixture.email,password:"wrong-password"})})).response.status,401);
  assert.equal((await call(base,"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).response.status,403);
  assert.equal((await call(base,"/api/auth/login",{method:"POST",headers:{Origin:"https://invalid.example","Content-Type":"application/json"},body:"{}"})).response.status,403);
  const oversized=await call(base,"/api/auth/login",{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({value:"x".repeat(1024*1024+100)})});assert.equal(oversized.response.status,413);assert.equal(oversized.body.error.code,"PAYLOAD_TOO_LARGE");assert.ok(oversized.body.requestId);
  let login=await call(base,"/api/auth/login",{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({identifier:fixture.email,password:fixture.password})});assert.equal(login.response.status,200);const sessionCookie=cookie(login.response);const cookieContract=login.response.headers.get("set-cookie")||"";assert.equal(/HttpOnly/i.test(cookieContract),true);assert.equal(/Secure/i.test(cookieContract),true);assert.equal(/SameSite=Lax/i.test(cookieContract),true);assert.equal(/Path=\//i.test(cookieContract),true);
  assert.equal((await call(base,"/api/auth/session",{headers:{Cookie:sessionCookie}})).body.authenticated,true);
  await pool.query("INSERT INTO quiz_attempts(id,student_id,topic,difficulty,question_type,status) VALUES($1,$2,'Restart fixture','medium','multiple-choice','ACTIVE')",[ids.attempt,ids.student]);
  assertStopped(await stop(server,"SIGTERM"),"SIGTERM");server=start(baseEnv(p));await wait(base);assert.equal((await call(base,"/api/auth/session",{headers:{Cookie:sessionCookie}})).body.authenticated,true);assert.equal(Number((await pool.query("SELECT count(*) FROM quiz_attempts WHERE id=$1",[ids.attempt])).rows[0].count),1);assertStopped(await stop(server,"SIGINT"),"SIGINT");
  const invalidCases=[{...baseEnv(await port()),AUTH_MODE:"production",STORAGE_MODE:"json"},{...baseEnv(await port()),STORAGE_MODE:"postgres",DATABASE_URL:""},{...baseEnv(await port()),STORAGE_MODE:"invalid"},{...baseEnv(await port()),APP_ORIGIN:""}];
  for(const env of invalidCases){const child=start(env);const code=await new Promise(resolve=>child.once("exit",resolve));assert.notEqual(code,0);child.output();}
  const outagePort=await port();const unreachable=["postgresql:","//invalid:invalid@127.0.0.1:1/unreachable"].join("");const outage=start({...baseEnv(outagePort),DATABASE_URL:unreachable,PG_CONNECTION_TIMEOUT_MS:"1000"});const degraded=await wait(`http://localhost:${outagePort}`,503);const degradedBody=await degraded.json();assert.equal(degradedBody.storageHealth,"unavailable");assert.equal(degradedBody.status,"degraded");outage.output();assertStopped(await stop(outage,"SIGTERM"),"SIGTERM");
  console.log("PASS  production startup, health, exposure, headers, session restart, negative config, outage, SIGTERM, and SIGINT acceptance");
})().catch(error=>{console.error(error&&error.stack?error.stack:(error.code||error.message));process.exitCode=1}).finally(async()=>{for(const child of children)if(child.exitCode===null)try{await stop(child,"SIGTERM")}catch(_){}try{await cleanup();const r=await pool.query("SELECT (SELECT count(*) FROM schools WHERE id=$1)+(SELECT count(*) FROM users WHERE id=$2) n",[ids.school,ids.user]);if(Number(r.rows[0].n)!==0){console.error("PRODUCTION_FIXTURE_RESIDUE");process.exitCode=1}}finally{await pool.end()}});
