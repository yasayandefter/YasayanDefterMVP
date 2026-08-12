"use strict";

/* =========================================================
   YAŞAYAN DEFTER
   RESEARCH ENGINE 14.0
   PART 1
========================================================= */

const analyzer = require("./analyzer");
const wikipedia = require("./wikipedia");
const summary = require("./summary");
const teacher = require("./teacher");
const images = require("./images");
const map = require("./map");
const network = require("./network");

/* =========================================================
   YARDIMCI
========================================================= */

function safeArray(value){

    return Array.isArray(value)
        ? value
        : [];

}

function safeText(value){

    if(typeof value !== "string")
        return "";

    return value.trim();

}

function unique(list){

    return [...new Set(
        safeArray(list)
            .filter(Boolean)
    )];

}

/* =========================================================
   BOŞ SONUÇ
========================================================= */

function emptyResult(query){

    return{

        ok:true,

        query,

        title:query,

        summary:"",

        interesting:"",

        facts:[],

        articles:[],

        images:[],

        related:[],

        followUpQuestions:[],

        knowledgeMap:{},

        quiz:null,

        ai:{},

        brain:{}

    };

}

/* =========================================================
   ANA ARAŞTIRMA
========================================================= */

async function research(query){

    query = safeText(query);

    if(!query){

        throw new Error("Araştırma konusu boş.");

    }

    const result = emptyResult(query);

    console.log("🔎 Araştırılıyor", { queryLength: query.length });

    return await continueResearch(
        query,
        result
    );

}

/* =========================================================
   DEVAM
========================================================= */

async function continueResearch(query,result){

    console.log("🧠 Soru analiz ediliyor...");

    let analysis = {};

    try{

        if(typeof analyzer.analyzeQuestion === "function"){

            analysis = await analyzer.analyzeQuestion(query);

        }
        else if(typeof analyzer.analyze === "function"){

            analysis = await analyzer.analyze(query);

        }
        else{

            analysis = {};

        }

    }catch(error){

        console.warn(
            "Analiz motoru çalışmadı:",
            error.message
        );

        analysis = {};

    }

    result.analysis = analysis;

    result.brain = {

        understoodTopic:
            analysis.topic ||
            query,

        category:
            analysis.subject ||
            "Genel",

        questionType:
            analysis.type ||
            "Genel",

        intent:
            analysis.intent ||
            "Bilgi",

        summary:"",
        facts:[],
        relatedTopics:[],
        followUpQuestions:[],
        quiz:null

    };

    console.log(
        "🎯 Konu hazırlandı",
        { topicLength: String(result.brain.understoodTopic || "").length }
    );

    console.log(
        "📂 Kategori:",
        result.brain.category
    );

    console.log(
        "❓ Soru Türü:",
        result.brain.questionType
    );

    console.log(
        "🎯 Amaç:",
        result.brain.intent
    );

    /* =========================================================
   WIKIPEDIA ARAŞTIRMASI
========================================================= */

console.log("🌍 Wikipedia araştırması başlıyor...");

let wiki = {};

try{

    try{

    const articles =
        await wikipedia.wikipediaSearch(
            result.brain.understoodTopic
        );

    wiki = {

        articles

    };

}catch(error){

    console.warn(
        "Wikipedia araştırması başarısız:",
        error.message
    );

    wiki = {

        articles:[]

    };

}
}catch(error){

    console.warn(
        "Wikipedia araştırması başarısız:",
        error.message
    );

    wiki = {};

}

result.wikipedia = wiki;

/* -----------------------------
   Makaleler
------------------------------ */

result.articles = safeArray(
    wiki.articles
);

/* -----------------------------
   Görseller
------------------------------ */

result.images = safeArray(
    wiki.images
);

/* -----------------------------
   Özet
------------------------------ */

if(result.articles.length){

    result.summary =
        safeText(
            result.articles[0].text
        );

}
/* -----------------------------
   Başlık
------------------------------ */

if(wiki.title){

    result.title = wiki.title;

}

/* -----------------------------
   Sonuç kontrolü
------------------------------ */

console.log(
    "📄 Makale:",
    result.articles.length
);

console.log(
    "🖼️ Görsel:",
    result.images.length
);

if(!result.summary && result.articles.length){

    const first = result.articles[0];

    result.summary =
        safeText(first.summary) ||
        safeText(first.extract) ||
        safeText(first.text) ||
        "";

}

console.log(
    "📝 Özet uzunluğu:",
    result.summary.length
);

// PART 4 burada başlayacak

return result;

}

/* =========================================================
   EXPORT
========================================================= */

module.exports={

    research

};
