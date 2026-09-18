"use strict";
const assert=require("node:assert/strict"),{finalize,relevance}=require("../brain/researchQuality");
const article=(title,text)=>({title,text,url:'https://example.org/'+encodeURIComponent(title)});
for(const [query,derived,definition] of [
 ['Aster','Aster University','Aster University, a teaching institution located in Aster.'],
 ['Ada Lovelace','Ada Lovelace Institute','Ada Lovelace Institute, an organization named after Ada Lovelace.'],
 ['Borealis','Borealis Station','Borealis Station, a transport facility serving Borealis.'],
 ['Neural learning','Neural learning Corporation','Neural learning Corporation, a company developing software.']
]){
 const ctx={query,intent:'GENERAL',expansions:[query],mode:'standard'};
 const exact=article(query,`${query}, a subject with an independent definition and documented history.`),related=article(derived,definition);
 assert.ok(relevance(exact,ctx)>relevance(related,ctx));
 assert.equal(finalize({articles:[related,exact]},ctx).title,query);
 const empty=finalize({articles:[related],images:[{title:derived,image:'https://example.org/derived.jpg'}]},ctx);
 assert.equal(empty.researchUnavailable,true);assert.deepEqual(empty.images,[]);assert.deepEqual(empty.articles,[]);
}
const ctx={query:'Optik hesaplama',intent:'TECHNOLOGY',expansions:[]};
const redirect=article('Fotonik hesaplama','Optik hesaplama, ışıkla bilgi işleyen bir bilgisayar yöntemidir.');
assert.ok(relevance(redirect,ctx)>=55);
assert.ok(relevance({...redirect,title:'Canonical concept',text:'A description of the concept.',redirectedFrom:'Optik hesaplama'},ctx)>=55);
const selected=article('Aster','Aster, a geographic region with a documented cultural history.');
selected.image='https://example.org/aster.jpg';
const images=finalize({articles:[selected],images:[{title:'Unrelated computing illustration',image:'https://example.org/computing.jpg',sourceUrl:'https://example.org/computing',articleImage:true}]},{query:'Aster',intent:'GENERAL',expansions:[]}).images;
assert.equal(images.length,1,'only the selected article can supply trusted article-image provenance');
assert.equal(images[0].image,selected.image);
console.log('PASS generic exact identity, derived entity rejection, honest empty, definition and redirect evidence');
