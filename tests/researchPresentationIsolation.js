"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/js/app.js','utf8');
const functions=['renderTopicImage','loadImageWithFallback','showNoImage','renderSources'];
let code='';for(const name of functions){const start=source.indexOf('function '+name+'(');const next=name==='loadImageWithFallback'?source.indexOf('function showNoImage',start):source.indexOf('/* ===',start);code+=source.slice(start,next<0?source.length:next)+'\n';}
const images=[],box={dataset:{},replaceChildren(...nodes){this.nodes=nodes;this.innerHTML='';}},container={innerHTML:'',children:[],appendChild(n){this.children.push(n)}};
const context={URL,Image:function(){images.push(this)},$:id=>id==='topicImageBox'?box:container,firstImage:items=>items?.[0]?.image||'',showNoImage:()=>{},escapeHTML:s=>String(s),currentAnalysis:null,window:{ResultRenderers:{safeUrl:v=>/^https:\/\//.test(v||'')?v:''}},document:{createElement:()=>({})}};
vm.createContext(context);vm.runInContext(code,context);
context.renderTopicImage({title:'First',images:[{image:'https://example.org/first.jpg'}]});
context.renderTopicImage({title:'Second',images:[{image:'https://example.org/second.jpg'}]});
images[0].onload();assert.ok(!box.nodes.length,'stale load cannot insert old hero');
images[1].onload();assert.equal(box.nodes[0].alt,'Second');
images[0].onerror();assert.equal(box.nodes[0].alt,'Second');
context.renderTopicImage({title:'Empty',images:[],image:'https://example.org/unranked.jpg'});assert.equal(box.nodes.length,0);
context.renderSources({title:'Second',url:'https://example.org/second',engine:'Internal Engine',sourceDetails:[{url:'https://example.org/second',name:'External Publisher'}],articles:[{title:'Second',url:'https://example.org/second',source:'External Publisher'}]});
assert.equal(container.children.length,1);assert.match(container.children[0].innerHTML,/External Publisher/);assert.doesNotMatch(container.children[0].innerHTML,/Internal Engine/);
assert.match(source,/select.value = id === "quizProDifficulty" \? "medium"/);
const settings={quizProDifficulty:{value:'easy'},quizProCount:{value:'10'},quizProType:{value:'true-false'}};
const quizContext={$:id=>settings[id],ensureProQuizSettings(){},renderProQuizQuestion(){}};
vm.createContext(quizContext);
vm.runInContext(source.slice(source.indexOf('function renderProQuiz('),source.indexOf('function renderProQuizQuestion(')),quizContext);
quizContext.renderProQuiz({difficulty:'medium',requestedCount:5,type:'multiple-choice'},{});
assert.equal(settings.quizProDifficulty.value,'medium');assert.equal(settings.quizProCount.value,'5');assert.equal(settings.quizProType.value,'multiple-choice');
console.log('PASS hero async state isolation, ranked-only images, external source attribution and preview difficulty default');

async function verifyResearchRace(delayRace) {
 const pending=new Map(),timers=[],rendered=[],input={value:'First'};
 const noop=()=>{};
 const ctx={URL,AbortController,console,API:'',researchSequence:0,activeResearchController:null,currentResearch:null,currentAnalysis:null,
  $:id=>id==='questionInput'?input:null,hideError:noop,showLoading:noop,renderKnowledgeGraphLoading:noop,resetLearning:noop,
  setInterval:()=>1,clearInterval:noop,setTimeout:resolve=>delayRace?timers.push(resolve):resolve(),activeStudentId:()=>'',isDemoMode:()=>false,
  getJSON:async url=>url.includes('/api/research')?{query:new URL(url,'https://example.org').searchParams.get('q')} : new Promise(resolve=>pending.set(new URL(url,'https://example.org').searchParams.get('q'),resolve)),
  renderResearch:data=>rendered.push(data.query),renderLivingMemoryResult:noop,canUsePersistentApi:()=>false,
  window:{dispatchEvent:noop},CustomEvent:function(){},document:{querySelectorAll:()=>[]},showError:()=>{throw Error('Unexpected research failure');},renderKnowledgeGraphError:noop};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function researchTopic('),source.indexOf('function getUniqueImages(')),ctx);
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 const first=ctx.researchTopic();await flush();
 if(delayRace){pending.get('First')({analysis:{topic:'First'}});await flush();}
 input.value='Second';const second=ctx.researchTopic();await flush();pending.get('Second')({analysis:{topic:'Second'}});await flush();
 if(delayRace)timers[1]();await second;
 if(delayRace)timers[0]();else pending.get('First')({analysis:{topic:'First'}});
 await first;assert.deepEqual(rendered,['Second']);assert.equal(ctx.currentAnalysis.topic,'Second');
}
Promise.all([verifyResearchRace(false),verifyResearchRace(true)]).then(()=>console.log('PASS late analysis and delayed-render responses cannot restore an older research result')).catch(error=>{console.error(error);process.exitCode=1;});
