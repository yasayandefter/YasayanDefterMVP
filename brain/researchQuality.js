"use strict";
const { buildStructuredContent } = require('./contentStructurer');
const { fold, dedupeFacts } = require('./researchIntelligence');
const visual = require('./visualIntelligence');
const validUrl = value => { try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; } };

function category(title, text) {
 const lead = fold(`${title} ${String(text || '').slice(0, 1200)}`);
 const definition = fold(String(text || '').slice(0, 450));
 const titleFold = fold(title);
 if (/\b(yapay zeka|bilgisayar|yazilim|algoritma|programlama|computing|computer)\b/.test(titleFold)) return /yapay zeka/.test(titleFold) ? 'Teknoloji ve Yapay Zekâ' : 'Teknoloji ve Bilişim';
 if (/\b(fizikci|kimyager|biyolog|matematikci|bilim insani|devlet adami|cumhurbaskani|maresal|yazar|sair|besteci|ressam|filozof|astronot|physicist|scientist|politician)\w*\b/.test(definition)) return 'Biyografi';
 const groups = [
  ['Biyoloji ve Yaşam Bilimleri', /\b(genetik|nukleik|nukleotit|hucre|organizma|biyolojik|bitki|protein|karbonhidrat|kalitim|genetic|nucleic|organism|cellular)\w*\b/],
  ['Teknoloji ve Yapay Zekâ', /\b(yapay zeka|makine ogrenmesi)\b/],
  ['Teknoloji ve Bilişim', /\b(bilgisayar|yazilim|algoritma|programlama|computing|computer)\w*\b/],
  ['Uzay ve Astronomi', /\b(gezegen\w*|galaksi|yildiz|astronomi|uydu)\b/],
  ['Tarih', /\b(imparator|padisah|savas|tarihci|hanedan|monarsi|beylik|empire|dynasty|historical)\w*\b/],
  ['Coğrafya', /\b(sehir\w*|kent\w*|ili|ilidir|ilce|bolge|nehir|ulke|city|province)\b/],
  ['İnsan ve Sağlık', /\b(hastalik|saglik|tedavi|hormon|tibbi)\w*\b/],
  ['Bilim', /\b(fizik|kimya|biyoloji|bilim|molekul|atom)\b/]
 ];
 return groups.find(([,pattern])=>pattern.test(lead))?.[0] || 'Genel Bilgi';
}

const STOP = new Set(['ve','ile','bir','the','and','of','for','hakkinda','nedir','kimdir']);
function relevance(article, context) {
 const query = String(context.query || context.normalizedQuery || '').trim();
 const sense = String(context.disambiguation?.selectedSense || '');
 const title = fold(article.title || '');
 const body = fold(`${article.title || ''} ${article.text || ''}`);
 const tokens = fold(query).split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP.has(t));
 const titleTokens = title.split(' ').filter(t => !STOP.has(t));
 const titleHits = tokens.filter(t => titleTokens.includes(t)).length;
 const bodyHits = tokens.filter(t => body.includes(t)).length;
 const phrase = fold(query);
 const directEntity = tokens.length > 0 && tokens.length <= 5 && !/[?]/.test(query) &&
  !/\b(nasil|neden|karsilastir|gelismeler|hakkinda)\b/.test(phrase) && context.intent !== 'COMPARISON';
 const identities = [phrase, ...(context.expansions || []).map(fold)].filter(Boolean);
 const aliases = [article.redirectedFrom, article.canonicalTitle, ...(Array.isArray(article.aliases) ? article.aliases : [])].filter(Boolean).map(fold);
 // A defining lead can establish a renamed/redirected concept. Mere mentions
 // later in an extract cannot identify an entity named after the query.
 const definition = fold(String(article.text || '').split(/[,(:;]/, 1)[0]);
 const definesQuery = identities.some(identity => definition === identity || ['i', 'si', 'dir', 'tir'].some(suffix => definition === identity + suffix));
 const exactIdentity = identities.includes(title) || aliases.some(alias => identities.includes(alias));
 if (directEntity && !exactIdentity && !definesQuery) return 0;
 let score = tokens.length ? (titleHits / tokens.length) * 75 + (bodyHits / tokens.length) * 15 : 0;
 score -= Math.max(0, titleTokens.length - tokens.length) * 12;
 if (definesQuery) score += 60;
 if (exactIdentity) score += 80;
 const expansions = (context.expansions || []).map(fold).filter(Boolean);
 const expansionHit = expansions.some(e => title.includes(e) || body.includes(e));
 if (expansionHit) score += 35;
 if (phrase && title === phrase) score += 45;
 if (context.intent === 'TECHNOLOGY' && /\b(artificial intelligence|machine learning|yapay zeka|yazilim|algoritma|bilgisayar)\b/.test(body)) score += 25;
 if (context.intent === 'PERSON' && titleHits >= Math.max(1, tokens.length - 1)) score += 20;
 return score;
}

function finalize(result, context) {
 if(context.mode === 'current') return result;
 const articles=(result.articles || []).filter(a=>validUrl(a.url) && a.text && !/anlam ayrımı|disambiguation/i.test(a.title));
 const ranked=articles.map(article => ({article, score: relevance(article, context)})).sort((a,b)=>b.score-a.score || Number(b.article.language === 'tr')-Number(a.article.language === 'tr'));
 const threshold = context.intent === 'COMPARISON' ? 35 : 55;
 const relevant = ranked.filter(item => item.score >= threshold);
 const main=relevant[0]?.article;
 // A biography/definition must not inherit facts about a namesake or a related person's life.
 const selected=main && context.intent !== 'COMPARISON' ? [main] : relevant.map(item=>item.article);
 if(!selected.length){
  const message='Bu konu için doğrulanabilir kaynak metnine şu anda ulaşılamadı. Lütfen daha sonra yeniden deneyin.';
  result.title=context.query;result.text='';result.summary=message;result.articles=[];result.images=[];result.image='';result.sources=[];result.sourceDetails=[];result.related=[];result.url='';result.researchUnavailable=true;
  result.structuredContent={version:'1.0',topic:context.query,audienceLevel:'general',summary:message,introduction:message,sections:[],keyFacts:[],keyConcepts:[],interestingFacts:[],followUpQuestions:[],limitations:[message],generatedFrom:{sourceCount:0,articleCount:0,usedFallback:true}};
  result.brain={...result.brain,category:category(context.query,''),summary:message,facts:[],quiz:null,flashcards:[]};
  result.ai={...result.ai,summary:message,facts:[],quiz:null,lesson:null};return result;
 }
 const subjectCategory=category(main?.title || context.query,main?.text || result.text);
 const subjectType = /Biyografi/.test(subjectCategory) ? 'PERSON' : /Biyoloji|Bilim|Sağlık/.test(subjectCategory) ? 'SCIENCE' : /Teknoloji/.test(subjectCategory) ? 'TECHNOLOGY' : /Uzay/.test(subjectCategory) ? 'SPACE' : /Coğrafya/.test(subjectCategory) ? 'PLACE' : /Tarih/.test(subjectCategory) ? 'HISTORY' : context.intent;
 const structured=buildStructuredContent({topic:main?.title || context.query,articles:selected,sourceCount:selected.length},{topic:context.query,intent:context.intent,subjectType,audienceLevel:result.structuredContent?.audienceLevel});
 structured.keyFacts=dedupeFacts(structured.keyFacts,selected);
 result.title=main?.title || result.title;result.url=main?.url || '';result.articles=selected;result.structuredContent=structured;
 result.summary=structured.summary;result.text=main?.text || result.text;
 const facts=structured.keyFacts.map(f=>f.text);
 result.followUpQuestions=structured.followUpQuestions;
 result.brain={...result.brain,category:subjectCategory,summary:structured.summary,facts,interesting:facts[0] || '',followUpQuestions:structured.followUpQuestions};
 result.ai={...result.ai,summary:structured.summary,facts,interesting:facts[0] || '',followUpQuestions:structured.followUpQuestions};
 const candidates=[...(result.images || [])];
 if(main?.image)candidates.unshift({title:main.title,image:main.image,original:main.image,url:main.url,source:main.source,sourceUrl:main.url,articleImage:true});
 const seen=new Set();
 result.images=candidates.map(item=>{
  const title=String(item.title || '').replace(/\.(jpg|jpeg|png|webp)$/i,'').replace(/_/g,' ');
  const words=fold(title);const queryWords=fold(result.title).split(' ').filter(w=>w.length>2);
  let score=queryWords.filter(w=>words.includes(w)).length/Math.max(1,queryWords.length)*60;
  // Provenance must refer to the selected article, not another candidate.
  if(item.articleImage && (item.sourceUrl || item.url) === main.url && item.image === main.image)score+=50;
  if(/portrait|portre/.test(words))score+=25;
  if(/memorial|monument|meeting|conference|summit|logo|icon|flag|emblem|psi|symbol|corporate|headquarters|toplanti|sirket|sosyal fayda/.test(words))score-=65;
  const caption=title.replace(/\bportrait\b/gi,'portresi').replace(/\bphotograph\b/gi,'fotoğrafı').replace(/\bplanet\b/gi,'gezegeni').replace(/\bsurface\b/gi,'yüzeyi');
  return {...item,title,caption,sourceUrl:item.sourceUrl || item.url,visualType:visual.classifyImageType(item),imageRelevanceScore:score};
 }).filter(item=>item.imageRelevanceScore>=28 && validUrl(item.image)).filter((item, _, candidates)=>{
  const promotional = candidate => /\b(eylem plani|action plan|campaign|kampanya|promotional|tanitim)\b/.test(fold(`${candidate.title} ${candidate.description || ''}`));
  return !promotional(item) || !candidates.some(candidate=>!promotional(candidate) && candidate.imageRelevanceScore>=item.imageRelevanceScore);
 }).sort((a,b)=>b.imageRelevanceScore-a.imageRelevanceScore).filter(item=>{
  const key=visual.canonical(item.original || item.image);if(!key || seen.has(key))return false;seen.add(key);return true;
 }).slice(0,6);
 result.image=result.images[0]?.image || '';
 return result;
}
module.exports={finalize,category,relevance};
