"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const { Pool } = require("pg");
const password = require("../auth/password");
const claims = require("../repositories/claimRepository");

if (!process.env.TEST_DATABASE_URL) { console.log("SKIP  Browser auth E2E: TEST_DATABASE_URL is not set"); process.exit(0); }
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL_ONLY");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const id = () => crypto.randomUUID();
const ids = { school: id(), teacher: id(), studentUser: id(), student: id(), unclaimed: id(), classroom: id(), claim: id(), memory: id() };
const suffix = crypto.randomBytes(5).toString("hex");
const fixture = { teacher: `browser-teacher-${suffix}@example.test`, student: `browser_student_${suffix}`, claimed: `browser_claimed_${suffix}`, individual: `browser_user_${suffix}`, password: "Phase6-browser-password!", claim: `P6-${crypto.randomBytes(8).toString("hex")}` };
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
let child; let browser; let activePage; const diagnostics = { console: [], page: [], network: [], requests: [] };

async function seed() {
  const hash = password.hashPassword(fixture.password);
  await pool.query("INSERT INTO schools(id,name) VALUES($1,'Browser E2E School')", [ids.school]);
  await pool.query("INSERT INTO users(id,role,email,display_name,password_hash,status) VALUES($1,'TEACHER',$2,'Browser Teacher',$3,'ACTIVE')", [ids.teacher,fixture.teacher,hash]);
  await pool.query("INSERT INTO users(id,role,username,display_name,password_hash,status) VALUES($1,'STUDENT',$2,'Browser Student',$3,'ACTIVE')", [ids.studentUser,fixture.student,hash]);
  await pool.query("INSERT INTO students(id,user_id,display_name) VALUES($1,$2,'Browser Student'),($3,NULL,'Browser Claim Student')", [ids.student,ids.studentUser,ids.unclaimed]);
  await pool.query("INSERT INTO classrooms(id,school_id,name,created_by) VALUES($1,$2,'Browser Classroom',$3)", [ids.classroom,ids.school,ids.teacher]);
  await pool.query("INSERT INTO classroom_memberships(id,classroom_id,user_id,role) VALUES($1,$2,$3,'TEACHER'),($4,$2,$5,'STUDENT')", [id(),ids.classroom,ids.teacher,id(),ids.studentUser]);
  await pool.query("INSERT INTO memory_records(id,student_id,topic,normalized_topic,title,summary,key_concepts,key_facts) VALUES($1,$2,'Mars','mars','Mars','Browser fixture summary','[\"Gezegen\"]','[{\"text\":\"Mars bir gezegendir\"}]')", [ids.memory,ids.student]);
  await pool.query("INSERT INTO student_claim_tokens(id,student_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour',$4)", [ids.claim,ids.unclaimed,claims.hashClaim(fixture.claim),ids.teacher]);
}
async function cleanup() {
  const students = [ids.student,ids.unclaimed];
  await pool.query("DELETE FROM xp_events WHERE student_id=ANY($1::uuid[])", [students]);
  await pool.query("DELETE FROM quiz_attempts WHERE student_id=ANY($1::uuid[])", [students]);
  await pool.query("DELETE FROM memory_records WHERE student_id=ANY($1::uuid[])", [students]);
  await pool.query("DELETE FROM classrooms WHERE id=$1", [ids.classroom]);
  await pool.query("DELETE FROM student_claim_tokens WHERE student_id=ANY($1::uuid[])", [students]);
  await pool.query("DELETE FROM students WHERE id=ANY($1::uuid[])", [students]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[]) OR username=$2", [[ids.teacher,ids.studentUser],fixture.claimed]);
  const individual = await pool.query("SELECT id FROM users WHERE username=$1", [fixture.individual]);
  if (individual.rows[0]) { const userId=individual.rows[0].id; const linked=await pool.query("SELECT id FROM students WHERE user_id=$1",[userId]); for(const row of linked.rows){await pool.query("DELETE FROM xp_events WHERE student_id=$1",[row.id]);await pool.query("DELETE FROM quiz_attempts WHERE student_id=$1",[row.id]);await pool.query("DELETE FROM memory_records WHERE student_id=$1",[row.id]);} await pool.query("DELETE FROM students WHERE user_id=$1",[userId]); await pool.query("DELETE FROM users WHERE id=$1",[userId]); }
  await pool.query("DELETE FROM schools WHERE id=$1", [ids.school]);
}
async function waitFor(base) { for (let i=0;i<80;i+=1) { try { if ((await fetch(base+"/api/status")).ok) return; } catch (_) {} await new Promise(r=>setTimeout(r,100)); } throw new Error("SERVER_NOT_READY"); }
function observe(page, state, base) {
  page.on("console", msg => { if (msg.type() === "error") state.console.push(msg.text()); });
  page.on("pageerror", error => state.page.push(error.message));
  page.on("request", request => { if (request.url().startsWith(base)) state.requests.push(new URL(request.url()).pathname); });
  page.on("requestfailed", request => { if (request.url().startsWith(base)) state.network.push(request.url()); });
}
async function login(page, identifier, rawPassword) {
  if (!await page.locator("[data-login-form]").isVisible()) await page.locator("[data-open-login]").click();
  await page.getByLabel("Kullanıcı adı veya e-posta").fill(identifier);
  await page.getByLabel("Parola", { exact: true }).fill(rawPassword);
  await page.getByLabel("Parola", { exact: true }).press("Enter");
  await page.waitForLoadState("domcontentloaded");
  await page.locator("[data-auth-user]").waitFor({ state: "visible" });
}
async function logout(page) { await page.getByRole("button", { name: "Çıkış yap" }).click(); await page.locator("[data-open-login]").waitFor({ state: "visible" }); await page.locator("[data-open-login]").click(); await page.locator("[data-login-form]").waitFor(); }
async function overflow(page) { return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); }

(async () => {
  assert.equal(require("node:fs").existsSync(EDGE), true);
  await seed(); const port = 34000 + crypto.randomInt(12000); const base = `http://localhost:${port}`;
  child = spawn(process.execPath,["server.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),AUTH_MODE:"production",STORAGE_MODE:"postgres",DATABASE_URL:process.env.TEST_DATABASE_URL,APP_ORIGIN:base,NODE_ENV:"test"},stdio:["ignore","ignore","ignore"]});
  await waitFor(base);
  browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const errors = diagnostics;

  const beforeDemo = await pool.query("SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM students) students,(SELECT count(*) FROM memory_records) memories,(SELECT count(*) FROM quiz_attempts) quizzes,(SELECT count(*) FROM xp_events) xp,(SELECT count(*) FROM classrooms) classrooms").then(r=>r.rows[0]);
  const demoContext = await browser.newContext({ viewport: { width: 390, height: 850 } }); await demoContext.route("https://fonts.googleapis.com/**", route=>route.fulfill({status:200,contentType:"text/css",body:""})); const demo = await demoContext.newPage(); activePage=demo; observe(demo,errors,base);
  await demo.goto(base); await demo.locator("[data-open-login]").waitFor(); assert.equal(await demo.locator(".auth-shell").isVisible(),false); assert.deepEqual(errors.console,[]); assert.deepEqual(errors.page,[]); assert.deepEqual(errors.network,[]); errors.requests.length=0;
  assert.equal(await demo.evaluate(()=>window.YasayanDefterAccess.isDemoMode()),true);
  await demo.locator("#questionInput").fill("Satürn halkaları"); const demoResearch=demo.waitForResponse(r=>r.url().includes("/api/research")&&r.status()===200); await demo.locator("#searchButton").click(); await demoResearch; await demo.locator("#results.visible").waitFor(); assert.ok((await demo.locator("#summaryText").textContent()).trim().length>0);
  for(const width of [390,768,1366]){await demo.setViewportSize({width,height:850});assert.ok((await overflow(demo))<=0);assert.equal(await demo.locator("#questionInput").isVisible(),true);}
  const forbiddenDemoRequests=errors.requests.filter(path=>path==="/api/analyze"||path.startsWith("/api/memory/")||path.startsWith("/api/progress")||path.startsWith("/api/recommendations")||path.startsWith("/api/teacher/")||path.startsWith("/api/classrooms")||path.startsWith("/api/students/")); assert.deepEqual(forbiddenDemoRequests,[]);
  assert.equal(errors.console.some(item=>/401|403|UNAUTHENTICATED|FORBIDDEN/i.test(item)),false); assert.deepEqual(errors.page,[]); assert.deepEqual(errors.network,[]);
  await demo.locator("[data-open-login]").click(); await demo.locator(".auth-shell").waitFor({state:"visible"}); await demoContext.close();
  const afterDemo = await pool.query("SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM students) students,(SELECT count(*) FROM memory_records) memories,(SELECT count(*) FROM quiz_attempts) quizzes,(SELECT count(*) FROM xp_events) xp,(SELECT count(*) FROM classrooms) classrooms").then(r=>r.rows[0]); assert.deepEqual(afterDemo,beforeDemo); errors.console.length=0; errors.page.length=0; errors.network.length=0; errors.requests.length=0;

  const userContext=await browser.newContext({viewport:{width:1024,height:850}});const user=await userContext.newPage();activePage=user;observe(user,errors,base);await user.goto(base);await user.getByRole("button",{name:/Hesap oluştur/}).click();await user.getByLabel("Kullanıcı adı",{exact:true}).fill(fixture.individual);await user.getByLabel("Parola",{exact:true}).fill(fixture.password);await user.getByLabel("Parola tekrar").fill(fixture.password);await user.getByRole("button",{name:"Hesap oluştur"}).click();await user.locator("[data-auth-user]").waitFor();assert.equal((await user.evaluate(async()=>await(await fetch('/api/auth/session')).json())).user.role,"USER");errors.console.length=0;errors.page.length=0;errors.network.length=0;errors.requests.length=0;
  await user.locator("#questionInput").fill("Venüs gezegeni");const userResearch=user.waitForResponse(r=>r.url().includes("/api/research")&&r.status()===200);await user.locator("#searchButton").click();await userResearch;await user.locator("#quizProStart").waitFor();const userQuizResearch={query:"Venüs",structuredContent:{keyFacts:[{text:"Venüs Güneş'e ikinci en yakın gezegendir.",concept:"Sıra"},{text:"Venüs kayasal bir gezegendir.",concept:"Tür"},{text:"Venüs yoğun bir atmosfere sahiptir.",concept:"Atmosfer"},{text:"Venüs'ün doğal uydusu yoktur.",concept:"Uydu"}]}};await user.evaluate(async research=>{const response=await fetch('/api/quiz/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({research,count:5})});const payload=await response.json();if(!response.ok)throw new Error('QUIZ_START_FAILED');window.renderProQuiz(payload.attempt,research,true)},userQuizResearch);await user.locator(".quiz-pro-skip").waitFor();for(let i=0;i<10;i+=1){if(await user.evaluate(()=>document.getElementById('quizQuestion')?.textContent.includes('Quiz sonucu')))break;await user.locator('.quiz-pro-skip').click();const next=user.getByRole('button',{name:/Sonraki soru|Sonuçları gör/});await next.waitFor();await next.click();await user.waitForTimeout(100)}await user.waitForFunction(()=>document.getElementById('quizQuestion')?.textContent.includes('Quiz sonucu'));assert.equal(await user.evaluate(async()=>(await fetch('/api/progress')).status),200);assert.equal(await user.locator('[data-classroom="true"]').isVisible(),false);assert.equal(await user.evaluate(async()=>(await fetch('/api/teacher/summary')).status),403);errors.console.length=0;await logout(user);await user.getByLabel("Kullanıcı adı veya e-posta").fill(fixture.individual);await user.getByLabel("Parola",{exact:true}).fill(fixture.password);await user.getByLabel("Parola",{exact:true}).press("Enter");await user.locator("[data-auth-user]").waitFor();await logout(user);await userContext.close();errors.console.length=0;errors.page.length=0;errors.network.length=0;errors.requests.length=0;

  const teacherContext = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const teacher = await teacherContext.newPage(); activePage = teacher; observe(teacher,errors,base);
  await teacher.goto(base); await teacher.locator("[data-open-login]").click(); await teacher.locator(".auth-shell").waitFor({state:"visible"});
  assert.equal(await teacher.locator('label[for="auth-identifier"]').count(),1); assert.equal(await teacher.locator('label[for="auth-password"]').count(),1);
  assert.equal(await teacher.getByLabel("Parola",{exact:true}).getAttribute("autocomplete"),"current-password");
  await teacher.getByLabel("Kullanıcı adı veya e-posta").focus(); await teacher.keyboard.press("Tab"); assert.equal(await teacher.evaluate(()=>document.activeElement.id),"auth-password");
  await login(teacher,fixture.teacher,fixture.password);
  const teacherCookies = await teacherContext.cookies(); const sessionCookie = teacherCookies.find(c=>c.name==="yd_session"); assert.ok(sessionCookie); assert.equal(sessionCookie.httpOnly,true); assert.equal(sessionCookie.secure,true); assert.equal(await teacher.evaluate(()=>document.cookie.includes("yd_session")),false);
  await teacher.locator('[data-classroom="true"]').click(); await teacher.locator("#classroomDashboard").waitFor(); await teacher.locator("#classroomSelector").selectOption(ids.classroom); const teacherSummaryResponse=teacher.waitForResponse(r=>r.url().includes("/api/teacher/summary")&&r.status()===200); await teacher.locator(`[data-student-id="${ids.student}"]`).click();
  await teacher.locator("#teacherDashboard").waitFor(); await teacherSummaryResponse;
  await teacher.waitForTimeout(1200); errors.console.length=0; errors.page.length=0; errors.network.length=0;
  assert.equal((await teacher.evaluate(async id=>(await fetch('/api/progress?studentId='+id)).status,ids.student)),200);
  await teacher.reload(); await teacher.locator("[data-auth-user]").waitFor(); assert.equal((await teacher.evaluate(async()=>await (await fetch('/api/auth/session')).json())).authenticated,true);
  await logout(teacher); assert.equal((await teacher.evaluate(async()=>await (await fetch('/api/auth/session')).json())).authenticated,false); await teacherContext.close();

  const studentContext = await browser.newContext({ viewport: { width: 1024, height: 850 } }); const student = await studentContext.newPage(); activePage=student; observe(student,errors,base); await student.goto(base); await login(student,fixture.student,fixture.password); await student.waitForTimeout(1200); errors.console.length=0; errors.page.length=0; errors.network.length=0;
  const studentSession = await student.evaluate(async()=>await (await fetch('/api/auth/session')).json()); assert.equal(studentSession.user.studentId,ids.student);
  assert.equal(await student.evaluate(async victim=>(await fetch('/api/progress?studentId='+victim)).status,ids.unclaimed),403); await student.waitForTimeout(250); errors.console.length=0;
  await student.locator("#questionInput").fill("Mars gezegeni"); const researchResponse = student.waitForResponse(r=>r.url().includes("/api/research")&&r.request().method()==="GET"); await student.locator("#searchButton").click(); assert.equal((await researchResponse).status(),200);
  await student.locator("#quizProStart").waitFor(); const deterministicResearch={query:"Mars",structuredContent:{keyFacts:[{text:"Mars, Güneş Sistemi'nde dördüncü sırada yer alan kayasal bir gezegendir.",concept:"Gezegen"},{text:"Mars'ın yüzeyindeki demir oksit gezegene belirgin kızıl görünümünü verir.",concept:"Yüzey"},{text:"Mars'ın Phobos ve Deimos adında iki küçük doğal uydusu vardır.",concept:"Uydu"},{text:"Mars atmosferinin büyük bölümü karbondioksit gazından oluşmaktadır.",concept:"Atmosfer"}]}}; await student.evaluate(async research=>{const response=await fetch('/api/quiz/start',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({research,count:5})});const payload=await response.json();if(!response.ok)throw new Error('QUIZ_START_FAILED');window.renderProQuiz(payload.attempt,research,true)},deterministicResearch); await student.locator(".quiz-pro-skip").waitFor();
  for(let i=0;i<10;i+=1){ if(await student.evaluate(()=>document.getElementById('quizQuestion')?.textContent.includes('Quiz sonucu')))break; await student.waitForFunction(()=>{const button=document.querySelector('.quiz-pro-skip');return button&&!button.disabled}); await student.locator(".quiz-pro-skip").click(); const next=student.getByRole("button",{name:/Sonraki soru|Sonuçları gör/}); await next.waitFor(); await next.click(); await student.waitForFunction(()=>document.getElementById('quizQuestion')?.textContent.includes('Quiz sonucu')||(()=>{const button=document.querySelector('.quiz-pro-skip');return button&&!button.disabled})()); }
  await student.waitForFunction(()=>document.getElementById('quizQuestion')?.textContent.includes('Quiz sonucu')); assert.ok(Number(await pool.query("SELECT count(*) FROM xp_events WHERE student_id=$1",[ids.student]).then(r=>r.rows[0].count))>=1);
  await student.reload(); await student.locator("[data-auth-user]").waitFor(); assert.equal((await student.evaluate(async()=>await (await fetch('/api/auth/session')).json())).authenticated,true);
  for(const width of [360,390,768,1024,1366]){await student.setViewportSize({width,height:850});assert.ok((await overflow(student))<=0);assert.equal(await student.locator("#questionInput").isVisible(),true);}
  await logout(student); await studentContext.close();

  const claimContext = await browser.newContext({ viewport: { width: 390, height: 850 } }); const claimPage = await claimContext.newPage(); activePage=claimPage; observe(claimPage,errors,base); await claimPage.goto(base); await claimPage.locator("[data-open-claim]").click(); errors.console.length=0; errors.page.length=0; errors.network.length=0;
  assert.equal(await claimPage.getByLabel("Parola",{exact:true}).getAttribute("autocomplete"),"new-password"); assert.equal(await claimPage.getByLabel("Parola tekrar").getAttribute("autocomplete"),"new-password"); assert.equal(await claimPage.locator('.auth-card [aria-live="polite"]').count(),1);
  for(const width of [360,390,768,1024,1366]){await claimPage.setViewportSize({width,height:850});assert.ok((await overflow(claimPage))<=0);assert.equal(await claimPage.locator(".auth-card").isVisible(),true);}
  await claimPage.getByLabel("Davet / claim kodu").fill(fixture.claim); await claimPage.getByLabel("Kullanıcı adı",{exact:true}).fill(fixture.claimed); await claimPage.getByLabel("Parola",{exact:true}).fill(fixture.password); await claimPage.getByLabel("Parola tekrar").fill(fixture.password); await claimPage.getByRole("button",{name:"Hesabımı oluştur"}).click(); await claimPage.waitForLoadState("domcontentloaded"); await claimPage.locator("[data-auth-user]").waitFor();
  assert.equal((await claimPage.evaluate(async()=>await (await fetch('/api/auth/session')).json())).user.studentId,ids.unclaimed); await claimPage.waitForTimeout(1000); errors.console.length=0; errors.page.length=0; errors.network.length=0; await logout(claimPage);
  await claimPage.locator("[data-open-claim]").click(); await claimPage.getByLabel("Davet / claim kodu").fill(fixture.claim); await claimPage.getByLabel("Kullanıcı adı",{exact:true}).fill(`reuse_${suffix}`); await claimPage.getByLabel("Parola",{exact:true}).fill(fixture.password); await claimPage.getByLabel("Parola tekrar").fill(fixture.password); await claimPage.getByRole("button",{name:"Hesabımı oluştur"}).click(); await claimPage.locator(".auth-message.is-error").waitFor(); assert.match(await claimPage.locator(".auth-message.is-error").textContent(),/kullan|claim|kod/i); errors.console.length=0; errors.page.length=0; errors.network.length=0; await claimContext.close(); activePage=null;

  assert.deepEqual(errors.console,[]); assert.deepEqual(errors.page,[]); assert.deepEqual(errors.network,[]);
  console.log("PASS  real Edge demo, individual user, teacher, student, claim, session, no-persistence, authorization, responsive, console, and cleanup browser E2E");
})().catch(async error=>{console.error(error&&error.stack?error.stack:(error.code||error.message));if(activePage&&!activePage.isClosed()){console.error(JSON.stringify({url:activePage.url(),authShells:await activePage.locator('.auth-shell').count(),scripts:await activePage.evaluate(()=>[...document.scripts].map(x=>x.src).filter(Boolean)),session:await activePage.evaluate(async()=>({status:(await fetch('/api/auth/session')).status})),diagnostics}))}process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(child&&child.exitCode===null){child.kill("SIGTERM");await new Promise(r=>child.once("exit",r));}try{await cleanup();const residue=await pool.query("SELECT (SELECT count(*) FROM schools WHERE id=$1)+(SELECT count(*) FROM students WHERE id=ANY($2::uuid[])) AS n",[ids.school,[ids.student,ids.unclaimed]]);if(Number(residue.rows[0].n)!==0){console.error("BROWSER_FIXTURE_RESIDUE");process.exitCode=1}}finally{await pool.end()}});
