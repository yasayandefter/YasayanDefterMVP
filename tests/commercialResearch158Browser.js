"use strict";
// Live integration QA: no research fixtures, mocked providers or production data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright-core");
const base = process.env.QA_BASE_URL || "http://localhost:3000";
const output = path.join(os.tmpdir(), "yd158-reference-qa");
fs.mkdirSync(output, { recursive: true });
(async () => {
 const browser = await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
 const page = await browser.newPage({viewport:{width:1536,height:768}});
 const errors = [], requests = [], report = {topics:[], viewports:[], errors};
 page.on("pageerror", e => errors.push(e.message));
 page.on("request", r => {if(new URL(r.url()).pathname === "/api/research") requests.push(r.url());});
 try {
 await page.goto(base);
 if(process.env.QA_USERNAME) {
 process.env.QA_USERNAME=process.env.QA_USERNAME;
 await page.locator("[data-landing-login]").first().click();
 await page.getByLabel("Kullanıcı adı veya e-posta",{exact:true}).fill(process.env.QA_USERNAME);
 await page.getByLabel("Parola",{exact:true}).fill(process.env.QA_PASSWORD);
 await page.getByRole("button",{name:"Giriş yap",exact:true}).click();
 } else {
 await page.locator("[data-open-register]").click();
 process.env.QA_USERNAME="visual_"+Date.now();
 await page.locator("#auth-username").fill(process.env.QA_USERNAME);
 await page.locator("#auth-newPassword").fill(process.env.QA_PASSWORD);
 await page.locator("#auth-confirmPassword").fill(process.env.QA_PASSWORD);
 await page.locator("[data-register-form] button[type=submit]").click();
 }
 await page.locator("#workspaceShell156").waitFor();
 await page.locator(".workspace-dialog[open]").waitFor({timeout:4000}).catch(()=>{});
 if(await page.locator(".workspace-dialog[open]").count()) await page.getByRole("button",{name:"Şimdilik geç"}).click();
 await page.locator('[data-shell-page="research"]').click();
 // Simulate asynchronous legacy visibility and mounting changes.
 await page.evaluate(()=>{document.querySelector("#yd-panel-home").hidden=false;document.querySelector('[data-mount="research"]').append(document.getElementById("workspaceHome"));});
 await page.waitForFunction(()=>document.querySelector("#yd-panel-home").hidden && document.getElementById("workspaceHome").closest('[data-shell-panel="home"]'));
 for(const topic of ["Mustafa Kemal Atatürk","Yapay zeka","Mars"]) {
  const before=requests.length;
  await page.locator("#questionInput").fill(topic);
  await page.locator("#searchButton").click();
  await page.waitForResponse(r=>new URL(r.url()).pathname==="/api/research" && r.status()===200,{timeout:120000});
  await page.waitForFunction(()=>document.querySelector("#results.visible") && document.querySelector("#loading")?.classList.contains("hidden"),{},{timeout:30000});
  await page.waitForTimeout(3500);
  const measurement=await measure(page);
  report.topics.push({topic,requests:requests.length-before,...measurement});
  await page.screenshot({path:path.join(output,topic+".png"),fullPage:true});
 }
 for(const width of [1536,1366,1024,768,390,360]) {
  await page.setViewportSize({width,height:width<768?844:768});
  await page.waitForTimeout(750);
  report.viewports.push({width,...await measure(page)});
  await page.screenshot({path:path.join(output,`viewport-${width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:1366,height:768});
 const before=requests.length;
 await page.getByRole("button",{name:"Tüm görselleri aç →",exact:true}).click();
 report.visuals=await page.locator("#yd-research-panel-visuals #imagesContainer").isVisible();
 await page.locator('[data-research-tab="overview"]').click();
 await page.getByRole("button",{name:"Quiz'i aç →",exact:true}).click();
 report.quiz=await page.locator("#yd-research-panel-quiz #quizQuestion").isVisible();
 const [quizResponse]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==="/api/quiz/start"),page.locator("#quizProStart").click()]);
 report.quizStartStatus=quizResponse.status();
 if(quizResponse.status()===200) {
  await page.locator("#quizOptions .quiz-option").first().waitFor();
  const [answerResponse]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==="/api/quiz/answer"),page.locator("#quizOptions .quiz-option").first().click()]);
  report.quizAnswerStatus=answerResponse.status();
 } else {
  report.quizResponse=await quizResponse.json();
  await page.waitForFunction(()=>document.querySelector("#quizResult")?.textContent.includes("sınırlıydı"));
  report.quizInsufficientDataVisible=await page.locator("#quizResult").isVisible();
 }
 await page.screenshot({path:path.join(output,"quiz.png")});
 for(const tool of ["sources","map","memory","overview"]) {
  const tab=page.locator(`[data-research-tab="${tool}"]`);
  if(await tab.isVisible()) {await tab.click();assert.equal(await tab.getAttribute("aria-selected"),"true");}
 }
 report.toolRequests=requests.length-before;
 const [saveResponse]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==="/api/memory/save"),page.locator("[data-research-save]").click()]);
 report.saveStatus=saveResponse.status();
 await page.waitForFunction(()=>document.querySelector("#saveTopicButton")?.classList.contains("saved"));
 const followBefore=requests.length;
 await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==="/api/research" && r.status()===200,{timeout:120000}),page.locator("#followContainer button").first().click()]);
 await page.waitForFunction(()=>document.querySelector("#loading")?.classList.contains("hidden"));
 report.followRequests=requests.length-followBefore;
 assert.equal(report.saveStatus,200); assert.equal(report.followRequests,1);
 await page.locator('[data-shell-page="home"]').click();
 report.researchLeaksIntoHome=await page.locator("#results").isVisible();
 report.homeVisible=await page.locator("#yd-panel-home").isVisible();
 await page.evaluate(()=>document.querySelector("#yd-panel-research").hidden=false);
 await page.waitForFunction(()=>document.querySelector("#yd-panel-research").hidden);
 fs.writeFileSync(path.join(output,"report.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify({output,...report},null,2));
 for(const topic of report.topics) {
  assert.equal(topic.requests,1); assert.equal(topic.page,"research"); assert.equal(topic.active,"overview");
  assert.equal(topic.home,false); assert.equal(topic.fullQuiz,0); assert.equal(topic.insightVisible,false);
  assert.ok(topic.primary.length && topic.primary.every(i=>i.loaded && i.height>=120));
  assert.ok(topic.discovery.length && topic.discovery.every(i=>i.loaded && i.height>=70));
 }
 for(const v of report.viewports) {assert.equal(v.overflow,0);assert.ok(v.contentRight<=v.width+1);if(v.width>=1024) {assert.ok(v.documentHeight<=960);assert.ok(v.follow.bottom<=960);assert.deepEqual(v.verticalScrollers,[]);}}
 assert.equal(report.toolRequests,0); assert.equal(report.visuals,true); assert.equal(report.quiz,true);
 if(report.quizStartStatus===200) assert.equal(report.quizAnswerStatus,200);
 else {assert.equal(report.quizStartStatus,422);assert.equal(report.quizInsufficientDataVisible,true);}
 assert.equal(report.researchLeaksIntoHome,false); assert.equal(report.homeVisible,true); assert.deepEqual(errors,[]);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
async function measure(page) {return page.evaluate(()=>{
 const box=n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,bottom:r.bottom};};
 const imgs=s=>[...document.querySelectorAll(s)].map(n=>({...box(n),loaded:n.complete&&n.naturalWidth>0}));
 return {page:document.documentElement.dataset.shellPage,active:document.querySelector("#researchWorkspace156")?.dataset.activeResearchPanel,
 home:!!document.querySelector("#yd-panel-home")?.getBoundingClientRect().height,fullQuiz:document.querySelectorAll("#yd-research-panel-overview #quizQuestion").length,
 primary:imgs("#topicImageBox img"),discovery:imgs(".yd-discovery-images img"),
 contentRight:Math.max(...[".hero-search","#heroSummary","#followContainer",".yd-overview-learning"].map(s=>document.querySelector(s).getBoundingClientRect().right)),
 heroFrame:box(document.querySelector("#topicImageBox")),insightVisible:!!document.querySelector(".yd-discovery-insight")?.getBoundingClientRect().height,
 verticalScrollers:[...document.querySelectorAll('#yd-panel-research *')].filter(n=>{const r=n.getBoundingClientRect();return r.height>0 && r.width>0 && /auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight>n.clientHeight+1;}).map(n=>n.id||n.className),
 follow:box(document.querySelector("#followContainer")),overflow:document.documentElement.scrollWidth-innerWidth,documentHeight:document.documentElement.scrollHeight};
 });}
