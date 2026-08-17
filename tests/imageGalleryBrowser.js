"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const {spawn}=require("node:child_process");
const {chromium}=require("playwright-core");
const EDGE="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
if(!fs.existsSync(EDGE)){console.log("SKIP  image gallery Edge E2E: Edge is not installed");process.exit(0);}
const port=47500+crypto.randomInt(1000),base=`http://127.0.0.1:${port}`;
let child,browser;
async function ready(){for(let i=0;i<80;i++){try{if((await fetch(base+"/api/status")).ok)return;}catch(_){}await new Promise(r=>setTimeout(r,100));}throw new Error("SERVER_TIMEOUT");}
function fixture(query,current=false){
  const files=["yasayan-defter-product-board.png","yasayan-defter-brand-board.png","yasayan-defter-official-logo.png"];
  const images=current?[]:files.map((file,index)=>({id:`img-${index}`,url:`${base}/assets/images/${file}`,thumbnailUrl:`${base}/assets/images/${file}`,title:`${query} öğrenme görseli ${index+1}`,description:`${query} için kaynak metadata açıklaması`,sourceName:"Wikimedia Commons",sourceUrl:"https://commons.wikimedia.org/wiki/Main_Page",domain:"commons.wikimedia.org",mime:"image/png",width:1200,height:800,license:index?"Belirtilmemiş":"CC BY-SA 4.0",attribution:"Wikimedia Commons",relevanceScore:90-index*5,visualType:index===0?"SCIENTIFIC_IMAGE":"PHOTO",sourceRefs:["https://commons.wikimedia.org/wiki/Main_Page"],isHero:index===0}));
  return {ok:true,query,title:query,mode:current?"current":"standard",currentState:current?"CURRENT_EMPTY":undefined,intent:current?"CURRENT_NEWS":"SCIENCE",summary:`${query} özeti`,text:`${query} özeti`,images,articles:[],sources:[],brain:{category:"Bilim",facts:[],flashcards:[]},ai:{},structuredContent:{summary:`${query} özeti`,sections:[],keyFacts:[],keyConcepts:[],interestingFacts:[],followUpQuestions:[],limitations:current?["Güncel görsel bulunamadı."]:[]},reliability:{score:60,level:"medium",sourceCount:0}};
}
async function render(page,data){await page.evaluate(value=>{renderResearch(value);document.querySelector("#results")?.classList.add("visible");},data);}
(async()=>{
  child=spawn(process.execPath,["server.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),VERCEL:"1",NODE_ENV:"production",AUTH_MODE:"",STORAGE_MODE:"",DATABASE_URL:"",ACCESS_MODE:""},stdio:["ignore","ignore","ignore"]});
  await ready();browser=await chromium.launch({executablePath:EDGE,headless:true});
  const page=await browser.newPage({viewport:{width:390,height:850}}),consoleErrors=[],pageErrors=[],unexpected=[];
  page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text())});page.on("pageerror",e=>pageErrors.push(e.message));page.on("response",r=>{if([401,403,500].includes(r.status()))unexpected.push(`${r.status()} ${r.url()}`)});
  await page.goto(base);
  for(const query of ["Atatürk","Mars","DNA","Kara delik","Mars vs Dünya"]){
    await render(page,fixture(query));
    assert.equal(await page.locator("#imagesContainer .image-card").count(),3);
    assert.equal(await page.locator("#imagesContainer .image-card-hero").count(),1);
    assert.match(await page.locator("#imagesContainer .image-caption").first().innerText(),/CC BY-SA 4.0/);
    assert.equal(await page.locator("#imagesContainer a",{hasText:"Kaynak"}).count(),3);
    const detail=page.locator("#imagesContainer button",{hasText:"Ayrıntıyı gör"}).first();await detail.click();
    await page.locator("#imageDetailDialog[open]").waitFor();assert.match(await page.locator("#imageDetailMeta").innerText(),/Lisans/);
    await page.getByRole("button",{name:"Görsel ayrıntısını kapat"}).click();assert.equal(await detail.evaluate(node=>node===document.activeElement),true);
  }
  await render(page,fixture("Bugünkü teknoloji",true));assert.equal(await page.locator("#imagesContainer .image-card:visible").count(),0);
  await render(page,fixture("Broken fixture"));await page.locator("#imagesContainer img").first().evaluate(img=>img.dispatchEvent(new Event("error")));assert.equal(await page.locator("#imagesContainer .image-card-broken").count(),1);
  for(const width of [360,390,768,1024,1366]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0,`overflow ${width}`);}
  assert.deepEqual(consoleErrors,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(unexpected,[]);
  console.log("PASS  real Edge image gallery named-query matrix, hero, source/license traceability, dialog keyboard focus, broken state and responsive rail");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(child&&child.exitCode===null)child.kill("SIGTERM");});
