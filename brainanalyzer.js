/*
=========================================================
 YAŞAYAN DEFTER
 Brain Engine 11.0
 Analyzer Module
=========================================================
*/

function cleanText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalize(value) {
    return cleanText(value)
        .toLocaleLowerCase("tr-TR")
        .replace(/â/g, "a")
        .replace(/î/g, "i")
        .replace(/û/g, "u");
}

function tokenize(text) {
    return normalize(text)
        .replace(/[?!.:,;()[\]{}"'“”‘’/\\-]+/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

/* =========================================================
   STOP WORDS
========================================================= */

const STOP_WORDS = new Set([
    "ve","veya","ile","bir","bu","şu","da","de",
    "için","icin","mi","mı","mu","mü",
    "neden","niçin","niye",
    "nasıl","nasil",
    "nedir","ne",
    "kim","kimdir",
    "kaç","kac",
    "nerede",
    "ne zaman",
    "hangi",
    "anlat",
    "açıkla",
    "acikla",
    "öğret",
    "ogret",
    "bilgi",
    "ver"
]);

/* =========================================================
   QUESTION TYPE
========================================================= */

function detectQuestionType(text){

    const q = normalize(text);

    if(/\b(neden|niçin|niye)\b/.test(q))
        return { type:"neden", intent:"neden-sonuç" };

    if(/\b(nasıl|nasil|oluşur|çalışır|calisir)\b/.test(q))
        return { type:"nasıl", intent:"mekanizma" };

    if(/\b(kim|kimdir)\b/.test(q))
        return { type:"kim", intent:"kişi" };

    if(/\b(nerede)\b/.test(q))
        return { type:"nerede", intent:"konum" };

    if(/\b(ne zaman)\b/.test(q))
        return { type:"zaman", intent:"zaman" };

    if(/\b(nedir|ne demek)\b/.test(q))
        return { type:"tanım", intent:"definition" };

    return {
        type:"genel",
        intent:"bilgi"
    };
}

/* =========================================================
   TOPIC EXTRACTION
========================================================= */

function extractTopic(text){

    const words = tokenize(text);

    const keywords = words.filter(word =>
        word.length > 2 &&
        !STOP_WORDS.has(word)
    );

    return keywords.slice(0,5).join(" ");
}

/* =========================================================
   DOMAIN DETECTION
========================================================= */

function detectDomain(topic){

    const t = normalize(topic);

    const domains = {

        Astronomi:[
            "uzay","gezegen","galaksi","evren",
            "kara delik","mars","güneş","ay","yıldız"
        ],

        Biyoloji:[
            "dna","hücre","gen","protein",
            "insan","hayvan","bitki","evrim"
        ],

        Kimya:[
            "atom","molekül","asit","baz",
            "kimya","element"
        ],

        Fizik:[
            "enerji","kuvvet","hareket",
            "ışık","elektrik","manyetik"
        ],

        Tarih:[
            "osmanlı","atatürk","roma",
            "hitit","savaş","cumhuriyet"
        ],

        Teknoloji:[
            "bilgisayar","yazılım",
            "algoritma","internet",
            "robot","yapay zeka"
        ],

        Sağlık:[
            "hastalık","tedavi",
            "doktor","ilaç","vitamin"
        ]

    };

    for(const domain in domains){

        for(const word of domains[domain]){

            if(t.includes(normalize(word))){
                return domain;
            }

        }

    }

    return "Genel Bilgi";
}

/* =========================================================
   KEYWORDS
========================================================= */

function extractKeywords(text){

    const words = tokenize(text);

    return [...new Set(

        words.filter(word =>
            word.length > 2 &&
            !STOP_WORDS.has(word)
        )

    )].slice(0,10);

}

/* =========================================================
   DIFFICULTY
========================================================= */

function detectDifficulty(question){

    const count = tokenize(question).length;

    if(count <= 5) return "Kolay";
    if(count <= 12) return "Orta";

    return "İleri";
}

/* =========================================================
   RELATED TOPICS
========================================================= */

function buildRelatedTopics(domain, topic){

    const map = {

        Astronomi:[
            "Galaksi",
            "Yıldız",
            "Kara Delik",
            "Samanyolu",
            "Evren",
            "NASA",
            "Gezegenler"
        ],

        Biyoloji:[
            "DNA",
            "Gen",
            "Protein",
            "Hücre",
            "Evrim"
        ],

        Kimya:[
            "Atom",
            "Molekül",
            "Periyodik Tablo",
            "Kimyasal Tepkime"
        ],

        Fizik:[
            "Enerji",
            "Kuvvet",
            "Hareket",
            "Işık"
        ],

        Teknoloji:[
            "Yapay Zeka",
            "Makine Öğrenmesi",
            "Robotik",
            "Algoritma"
        ],

        Tarih:[
            "Osmanlı",
            "Cumhuriyet",
            "Atatürk",
            "Roma"
        ]

    };

    const list = map[domain] || [];

    return list.filter(item =>
        normalize(item) !== normalize(topic)
    );

}

/* =========================================================
   RESEARCH PLAN
========================================================= */

function buildResearchPlan(type, topic){

    switch(type){

        case "nasıl":
            return [
                topic + " nedir",
                topic + " nasıl oluşur",
                topic + " çalışma mekanizması",
                topic + " bilimsel açıklama"
            ];

        case "neden":
            return [
                topic + " neden olur",
                topic + " nedenleri",
                topic + " bilimsel araştırmalar"
            ];

        case "kim":
            return [
                topic + " biyografi",
                topic + " hayatı",
                topic + " çalışmaları"
            ];

        default:
            return [
                topic,
                topic + " nedir",
                topic + " hakkında"
            ];
    }

}

/* =========================================================
   MAIN ANALYZER
========================================================= */

function analyzeQuestion(question){

    const info = detectQuestionType(question);

    const topic = extractTopic(question);

    const domain = detectDomain(topic);

    const keywords = extractKeywords(question);

    const difficulty = detectDifficulty(question);

    const relatedTopics = buildRelatedTopics(domain, topic);

    const researchPlan = buildResearchPlan(info.type, topic);

    return {

        originalQuestion: cleanText(question),

        normalizedQuestion: normalize(question),

        type: info.type,

        intent: info.intent,

        topic,

        domain,

        difficulty,

        keywords,

        relatedTopics,

        researchPlan

    };

}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    cleanText,
    normalize,
    tokenize,

    STOP_WORDS,

    detectQuestionType,

    extractTopic,
    detectDomain,
    extractKeywords,

    detectDifficulty,

    buildRelatedTopics,
    buildResearchPlan,

    analyzeQuestion

};