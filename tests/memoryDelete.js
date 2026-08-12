"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const password = require("../auth/password");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  memory delete: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 }); const id=()=>crypto.randomUUID(); const suffix=crypto.randomBytes(5).toString("hex");
const users={a:`delete_a_${suffix}`,b:`delete_b_${suffix}`,student:`delete_student_${suffix}`,teacher:`delete_teacher_${suffix}@example.test`}; const secret="Delete-test-password!";
const ids={studentUser:id(),student:id(),teacher:id()}; let child; const createdUsers=[];
function start(base,port){child=spawn(process.execPath,["server.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ACCESS_MODE:"authenticated",AUTH_MODE:"production",STORAGE_MODE:"postgres",DATABASE_URL:process.env.TEST_DATABASE_URL,APP_ORIGIN:base,NODE_ENV:"test"},stdio:["ignore","ignore","ignore"]})}
async function stop(){if(child&&child.exitCode===null){child.kill("SIGTERM");await new Promise(resolve=>child.once("exit",resolve))}}
async function waitFor(base){for(let i=0;i<80;i+=1){try{if((await fetch(base+"/api/status")).ok)return}catch(_){}await new Promise(resolve=>setTimeout(resolve,100))}throw new Error("SERVER_NOT_READY")}
async function call(base,path,options={}){const headers={Accept:"application/json",...(options.headers||{})};if(options.body&&!headers["Content-Type"])headers["Content-Type"]="application/json";const response=await fetch(base+path,{...options,headers});const text=await response.text();assert.equal(/DATABASE_URL|password_hash|scrypt\$|SELECT |DELETE FROM/i.test(text),false);let body={};try{body=JSON.parse(text)}catch(_){}return{response,body}}
const cookieOf=response=>String(response.headers.get("set-cookie")||"").split(";")[0];
async function register(base,username){const result=await call(base,"/api/auth/register",{method:"POST",headers:{Origin:base},body:JSON.stringify({username,password:secret})});assert.equal(result.response.status,201);createdUsers.push(result.body.user.id);return{cookie:cookieOf(result.response),id:result.body.user.id}}
async function login(base,identifier){const result=await call(base,"/api/auth/login",{method:"POST",headers:{Origin:base},body:JSON.stringify({identifier,password:secret})});assert.equal(result.response.status,200);return cookieOf(result.response)}
async function save(base,cookie,topic,extra={}){return call(base,"/api/memory/save",{method:"POST",headers:{Cookie:cookie,Origin:base},body:JSON.stringify({topic,title:topic,summary:"Owned",...extra})})}
async function remove(base,cookie,memoryId,extra={}){return call(base,"/api/memory/"+memoryId,{method:"DELETE",headers:{Cookie:cookie,Origin:base},body:JSON.stringify(extra)})}

(async()=>{
  const hash=password.hashPassword(secret);await pool.query("INSERT INTO users(id,role,username,display_name,password_hash,status) VALUES($1,'STUDENT',$2,'Student',$4,'ACTIVE'),($3,'TEACHER',NULL,'Teacher',$4,'ACTIVE')",[ids.studentUser,users.student,ids.teacher,hash]);await pool.query("UPDATE users SET email=$2 WHERE id=$1",[ids.teacher,users.teacher]);await pool.query("INSERT INTO students(id,user_id,display_name) VALUES($1,$2,'Student')",[ids.student,ids.studentUser]);
  const port=40000+crypto.randomInt(6000);const base=`http://127.0.0.1:${port}`;start(base,port);await waitFor(base);
  const a=await register(base,users.a);const b=await register(base,users.b);
  await call(base,"/api/research?q=Mars",{headers:{Cookie:a.cookie,"X-Research-Request-Id":id()}});let saved=await save(base,a.cookie,"Mars");assert.equal(saved.response.status,200);const memoryId=saved.body.memory.id;
  const before=(await call(base,"/api/progress",{headers:{Cookie:a.cookie}})).body.profile;
  let result=await remove(base,b.cookie,memoryId,{ownerId:a.id,userId:a.id,role:"USER"});assert.equal(result.response.status,403);assert.equal(result.body.error.code,"FORBIDDEN");
  result=await remove(base,a.cookie,id());assert.equal(result.response.status,404);assert.equal(result.body.error.code,"NOT_FOUND");
  result=await remove(base,"",memoryId);assert.equal(result.response.status,401);
  const countBefore=Number((await pool.query("SELECT count(*) FROM memory_records")).rows[0].count);result=await remove(base,"",memoryId,{demo:true});assert.equal(result.response.status,401);assert.equal(Number((await pool.query("SELECT count(*) FROM memory_records")).rows[0].count),countBefore);
  result=await remove(base,a.cookie,memoryId,{ownerId:b.id,userId:b.id,studentId:ids.student,role:"TEACHER"});assert.equal(result.response.status,200);
  result=await remove(base,a.cookie,memoryId);assert.equal(result.response.status,404);
  assert.equal((await call(base,"/api/memory/list",{headers:{Cookie:a.cookie}})).body.memories.some(item=>item.id===memoryId),false);
  const after=(await call(base,"/api/progress",{headers:{Cookie:a.cookie}})).body.profile;assert.deepEqual(after.streak,before.streak);assert.deepEqual(after.weeklyGoal,before.weeklyGoal);assert.equal(after.brainScore,before.brainScore);
  saved=await save(base,a.cookie,"Mars");assert.equal(saved.response.status,200);assert.ok(saved.body.memory.id);await remove(base,a.cookie,saved.body.memory.id);
  const studentCookie=await login(base,users.student);saved=await save(base,studentCookie,"Student own");assert.equal(saved.response.status,200);assert.equal((await remove(base,studentCookie,saved.body.memory.id)).response.status,200);
  const teacherCookie=await login(base,users.teacher);saved=await save(base,a.cookie,"Teacher target");assert.equal((await remove(base,teacherCookie,saved.body.memory.id,{studentId:ids.student})).response.status,403);await remove(base,a.cookie,saved.body.memory.id);
  await stop();start(base,port);await waitFor(base);const restored=await login(base,users.a);assert.equal((await call(base,"/api/memory/list",{headers:{Cookie:restored}})).body.memories.some(item=>item.id===memoryId),false);
  console.log("PASS  authenticated memory hard delete, ownership, IDOR, student/teacher/public denial, 404, double delete, re-save, progress stability, and restart persistence");
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1}).finally(async()=>{await stop();try{const all=[...createdUsers,ids.studentUser,ids.teacher];await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])",[all]);await pool.query("DELETE FROM memory_records WHERE owner_user_id=ANY($1::uuid[]) OR student_id=$2",[all,ids.student]);await pool.query("DELETE FROM research_activity_events WHERE owner_user_id=ANY($1::uuid[]) OR student_id=$2",[all,ids.student]);await pool.query("DELETE FROM xp_events WHERE owner_user_id=ANY($1::uuid[]) OR student_id=$2",[all,ids.student]);await pool.query("DELETE FROM quiz_attempts WHERE owner_user_id=ANY($1::uuid[]) OR student_id=$2",[all,ids.student]);await pool.query("DELETE FROM students WHERE id=$1",[ids.student]);await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])",[all])}finally{await pool.end()}});
