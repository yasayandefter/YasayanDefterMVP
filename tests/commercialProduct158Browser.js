"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { chromium } = require("playwright-core");
const base = process.env.QA_BASE_URL || "http://localhost:3000";
const output = process.env.QA_OUTPUT || path.join(os.tmpdir(), "yd158-product-qa");
assert.ok(process.env.QA_USERNAME && process.env.QA_PASSWORD, "QA_USERNAME and QA_PASSWORD required");
fs.mkdirSync(output, { recursive:true });
(async () => {
 const browser = await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
 const page = await browser.newPage({viewport:{width:1536,height:768}});
 const errors=[], requests=[]; const report={workspaces:[],tools:[],errors};
 page.on("pageerror", e=>errors.push(e.message));
 page.on("request",r=>{if(new URL(r.url()).pathname==="/api/research") requests.push(r.url());});
 try {
  await page.goto(base); await page.locator('[data-landing-login]').first().click();
  await page.locator('#auth-identifier').fill(process.env.QA_USERNAME);
  await page.locator('#auth-password').fill(process.env.QA_PASSWORD);
  await page.locator('[data-login-form] button[type=submit]').click();
  await page.locator('#workspaceShell156').waitFor(); await page.waitForTimeout(1500);
  if (await page.locator('.workspace-dialog[open]').count()) {
   await page.getByRole('button', {name:'Şimdilik geç'}).click();
  }
  report.states = [];
  for(const name of ['home','research','notebook','collections','personal','profile']) {
   await page.locator('button[data-shell-page="'+name+'"]').click();
   assert.equal(await page.locator('[data-shell-panel]').count(),6,'Exactly six workspace panels');
   assert.equal(await page.locator('.yd-shell-nav-item[aria-selected=true]').getAttribute('data-shell-page'),name);
   assert.equal(await page.locator('[data-shell-panel]:visible').count(),1);
  }
  report.navigationSequence=true;
  if (process.env.QA_SEED) {
   for (const name of ['notebook','collections','personal']) {
    await page.locator('button[data-shell-page="'+name+'"]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
    await page.screenshot({path:path.join(output,name+'-empty.png'),fullPage:true});
   }
   report.states.push('empty workspaces');
   await page.evaluate(async()=>{
    const ids=[];
    for(let i=0;i<24;i++) {
     const r=await fetch('/api/memory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Deneme notu '+(i+1),content:'Yerel arayüz doğrulaması için oluşturulan not.',workspaceArea:'work',contentType:'note',tags:['inceleme'],metadata:{}})});
     if(!r.ok) throw Error('QA note creation failed'); ids.push((await r.json()).memory.id);
    }
    for(let i=0;i<8;i++) {
     const r=await fetch('/api/collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Deneme koleksiyonu '+(i+1),description:'Yerel arayüz doğrulaması',workspaceArea:'work',recordIds:ids.slice(i,i+3)})});
     if(!r.ok) throw Error('QA collection creation failed');
    }
   });
   await page.reload(); await page.locator('#workspaceShell156').waitFor(); await page.waitForTimeout(1500);
   if (await page.locator('.workspace-dialog[open]').count()) await page.getByRole('button',{name:'Şimdilik geç'}).click();
   await page.locator('button[data-shell-page="notebook"]').click();
   await page.locator('.yd-notebook-open').first().waitFor();
   // Fault injection tests only presentation recovery; runtime APIs are untouched.
   await page.route('**/api/memory/list?**',async route=>{
    if(new URL(route.request().url()).searchParams.has('q')) return route.fulfill({status:503,json:{error:'QA unavailable'}});
    return route.continue();
   });
   await page.locator('.yd-notebook-open').first().click();
   await page.locator('.yd-notebook-detail [role=alert]').waitFor();
   await page.getByRole('button',{name:'Not ayrıntısını kapat',exact:true}).click();
   assert.equal(await page.locator('.yd-notebook-detail').isVisible(),false);
   await page.unroute('**/api/memory/list?**');
   report.states.push('notebook detail error and close');
   await page.route('**/api/memory/list?**',async route=>{await new Promise(resolve=>setTimeout(resolve,400));await route.continue();});
   await page.locator('.yd-notebook-open').first().click();
   await page.locator('.yd-notebook-detail-loading').waitFor();
   await page.locator('.yd-notebook-detail h2').waitFor();
   await page.getByRole('button',{name:'Not ayrıntısını kapat',exact:true}).click();
   await page.unroute('**/api/memory/list?**');
   report.states.push('notebook loading and populated detail');
  }
  for(const width of [1536,1366,1024,768,390,360]) {
   await page.setViewportSize({width,height:width<700?844:768});
   for(const name of ['home','notebook','collections','personal','profile']) {
    await page.locator('button[data-shell-page="'+name+'"]').click(); await page.waitForTimeout(180);
    const metrics=await page.evaluate(()=>{
     const visible=e=>!!e&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none';
     const nav=[...document.querySelectorAll('.yd-shell-nav-item')].map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.left>=0&&r.right<=innerWidth&&(hit===e||e.contains(hit));});
     const panel=document.querySelector('[data-shell-panel="'+document.documentElement.dataset.shellPage+'"]');
     const scrolls=[...panel.querySelectorAll('*')].filter(e=>visible(e)&&e.scrollHeight>e.clientHeight+2&&/auto|scroll/.test(getComputedStyle(e).overflowY));
     const nested=scrolls.filter(e=>scrolls.some(parent=>parent!==e&&parent.contains(e))).map(e=>e.id||e.className);
     return {page:document.documentElement.dataset.shellPage,width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,height:document.documentElement.scrollHeight,panels:[...document.querySelectorAll('[data-shell-panel]')].filter(visible).map(e=>e.dataset.shellPanel),researchVisible:visible(document.querySelector('#results')),navReachable:nav.every(Boolean),nested};
    });
    report.workspaces.push(metrics);
    await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});
    assert.equal(metrics.overflow,0,name+' overflow '+width);
    assert.deepEqual(metrics.panels,[name]); assert.equal(metrics.researchVisible,false);
    assert.equal(metrics.navReachable,true,name+' navigation '+width); assert.deepEqual(metrics.nested,[],name+' nested scrolling '+width);
    if(name==='home' && width<768) {
     assert.equal(await page.locator('.yd-home-actions>.yd-home-section-head>.yd-eyebrow').isVisible(),false);
     assert.ok(await page.locator('[data-metric-source=commercialGoalLabel] strong').evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);return range.getClientRects().length<=1;}),'Goal stays on one line');
    }
    if(name==='notebook') assert.ok(await page.locator('#notebookList').evaluate(e=>[...e.querySelectorAll('.smart-note-card')].every(card=>{const r=card.getBoundingClientRect(),b=card.querySelector('.yd-notebook-open')?.getBoundingClientRect();return !b||(b.bottom<=r.bottom+1&&b.left>=r.left&&b.right<=r.right+1);})), 'Notebook actions contained '+width);
   }
  }
  await page.setViewportSize({width:1536,height:768});
  await page.locator('button[data-shell-page="personal"]').click();
  if(await page.locator('.yd-personal-item').count()) {
   const suggested=await page.locator('#homeIntelligence .home-context-item').count();
   const title=await page.locator('.yd-personal-item h3').first().textContent();
   await page.locator('.yd-personal-item button').first().click();
   if(suggested) assert.equal(await page.locator('#smartNoteSearch').inputValue(),title);
   else await page.locator('.yd-notebook-detail:not([hidden]) h2').waitFor();
   assert.equal(await page.locator('html').getAttribute('data-shell-page'),'notebook');
   await page.keyboard.press('Escape'); report.personalContinuation=true;
  }
  await page.locator('button[data-shell-page="home"]').click();
  if(await page.locator('#yd-panel-home .home-context-cta').count()) {
   await page.locator('#yd-panel-home .home-context-cta').first().click();
   assert.equal(await page.locator('html').getAttribute('data-shell-page'),'notebook');
   report.states.push('Home continuation reveals notebook');
  }
  await page.locator('button[data-shell-page="collections"]').click();
  await page.locator('[data-collection-view="list"]').click();
  assert.equal(await page.locator('#collectionsWorkspace156').getAttribute('data-collection-view'),'list');
  await page.locator('[data-collection-view="grid"]').click();
  await page.locator('.yd-collections-create').click();
  await page.locator('dialog[open]').waitFor(); await page.keyboard.press('Escape'); report.collectionCreateOpens=true;
  await page.locator('button[data-shell-page="profile"]').click();
  await page.locator('#editProfileButton').click(); await page.locator('.auth-card[role="dialog"]').waitFor(); await page.keyboard.press('Escape'); report.profileEditOpens=true;
  for(const width of [1536,1366,1024,768,390,360]) {
   await page.setViewportSize({width,height:844});
   for(const fold of await page.locator('.yd-profile-fold').all()) {
    await fold.locator('summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,'Expanded profile overflow');
    const preview=page.locator('#notebookBackgroundPreviewImage');
    if(await preview.getAttribute('hidden')!==null) assert.equal(await preview.isVisible(),false,'Empty photo preview stays hidden');
    await page.screenshot({path:path.join(output,'profile-expanded-'+width+'-'+await fold.locator('summary').textContent()+'.png'),fullPage:true});
    await fold.locator('summary').click();
   }
  }
  await page.setViewportSize({width:1536,height:768});
  if(!process.env.QA_SKIP_RESEARCH) {
   await page.locator('button[data-shell-page="home"]').click();
   await page.locator('.yd-home-search input').fill('Mars');
   const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/research'&&r.status()===200,{timeout:120000});
   await page.locator('.yd-home-search button').click(); await result; await page.waitForTimeout(3500);
   assert.equal(requests.length,1); assert.equal(await page.locator('[data-research-tab="overview"]').getAttribute('aria-selected'),'true');
   await page.screenshot({path:path.join(output,'locked-overview.png'),fullPage:true});
   // New dedicated-tool stylesheet must have zero effect on the approved Overview.
   const snapshot=()=>page.evaluate(()=>[...document.querySelectorAll('#yd-research-panel-overview *')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return [r.x,r.y,r.width,r.height,s.color,s.background,s.font,s.display];}));
   const before=await snapshot();
   await page.locator('link[href*="product-tools-15-8"]').evaluate(e=>e.disabled=true);
   assert.deepEqual(await snapshot(),before,'Dedicated CSS changed Overview');
   await page.locator('link[href*="product-tools-15-8"]').evaluate(e=>e.disabled=false);
   for(const width of [1536,1366,1024,768,390,360]) {
    await page.setViewportSize({width,height:width<700?844:768});
    await page.locator('[data-research-tab="overview"]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,'Overview overflow '+width);
    await page.screenshot({path:path.join(output,'overview-'+width+'.png'),fullPage:true});
    for(const tool of ['visuals','sources','quiz','map','memory']) {
     await page.locator('[data-research-tab="'+tool+'"]').click(); await page.waitForTimeout(180);
     if(tool==='visuals') {
      for(const img of await page.locator('#imagesContainer img').all()) await img.scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>[...document.querySelectorAll('#imagesContainer img')].every(e=>e.complete&&e.naturalWidth>0),{},{timeout:30000});
      await page.evaluate(()=>scrollTo(0,0));
     }
     if(tool==='quiz' && await page.locator('#quizProCount').count()) {
      assert.equal(await page.locator('#quizProCount').isVisible(),true);
      assert.equal(await page.locator('#quizSettings').isVisible(),false);
      assert.equal(await page.locator('#quizProStart').isVisible(),true);
     }
     if(tool==='map' && await page.locator('.knowledge-map-svg').count()) {
      if(width<=1024) {
       assert.equal(await page.locator('.knowledge-map-svg').isVisible(),false);
       assert.equal(await page.locator('.yd-map-link').count(),await page.locator('.knowledge-map-node:not(.is-center)').count());
       assert.equal(await page.locator('.yd-map-compact').isVisible(),true);
      } else assert.ok(await page.locator('.knowledge-map-svg').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return r.right<=p.right+1&&r.width>=Math.min(850,p.width-60)&&Math.abs((r.left+r.right)-(p.left+p.right))<4;}),'Desktop graph fills and centers within its canvas');
     }
     const m=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,home:document.querySelector('#yd-panel-home').getBoundingClientRect().height,images:[...document.querySelectorAll('#imagesContainer img')].filter(e=>e.getBoundingClientRect().height).map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,loaded:e.naturalWidth>0}))}));
     report.tools.push({tool,...m}); await page.screenshot({path:path.join(output,tool+'-'+width+'.png'),fullPage:true});
     const nested=await page.locator('#yd-research-panel-'+tool).evaluate(e=>[e,...e.querySelectorAll('*')].filter(n=>n.clientHeight>0&&n.scrollHeight>n.clientHeight+2&&/auto|scroll/.test(getComputedStyle(n).overflowY)).map(n=>n.id||n.className));
     assert.deepEqual(nested,[],'Nested vertical scroll '+tool);
     assert.ok(await page.locator('#yd-research-panel-'+tool).evaluate(e=>document.querySelector('.yd-research-tabs').getBoundingClientRect().bottom<=e.getBoundingClientRect().top+1),'Tabs must precede '+tool);
     assert.equal(m.overflow,0,tool+' overflow '+width);assert.equal(m.home,0);
     if(tool==='visuals') {
      if(m.images.length) assert.ok(m.images.every(e=>e.loaded&&e.h>=200&&e.w>40));
      else {assert.ok((await page.locator('#yd-research-panel-visuals').innerText()).trim().length>0);report.states.push('visuals without provider images at '+width);}
     }
    }
   }
   assert.equal(requests.length,1);report.duplicateResearchRequests=0;report.overviewUnchanged=true;
   await page.locator('button[data-shell-page="home"]').click();
   assert.equal(await page.locator('#results').isVisible(),false);
   assert.equal(await page.locator('#yd-panel-research').getAttribute('aria-hidden'),'true');
   await page.locator('button[data-shell-page="research"]').click();
   assert.equal(await page.locator('#yd-panel-home').isVisible(),false);
   assert.equal(requests.length,1);
   await page.setViewportSize({width:390,height:844});
   await page.locator('[data-research-tab="map"]').click();
   if(await page.locator('.yd-map-link').count()) {
    const next=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/research'&&r.status()===200,{timeout:120000});
    await page.locator('.yd-map-link').first().click(); await next; await page.waitForTimeout(300);
    assert.equal(requests.length,2,'One research request per compact map action');
    report.states.push('compact map action forwards once');
   }
  }
  assert.deepEqual(errors,[]);report.passed=true;
 } catch(error) {
  await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});
  report.failureLayout=await page.locator('#notebookList').evaluate(e=>[e,...e.querySelectorAll('.smart-note-card')].slice(0,5).map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {class:n.className,box:{x:r.x,y:r.y,w:r.width,h:r.height},rows:s.gridTemplateRows,autoRows:s.gridAutoRows,height:s.height,flex:s.flex,overflow:s.overflow};}));
  throw error;
 } finally {fs.writeFileSync(path.join(output,'product-report.json'),JSON.stringify(report,null,2)); await browser.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
