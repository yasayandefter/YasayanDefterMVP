
/* =========================================================
   YAŞAYAN DEFTER
   BRAIN ENGINE 10.0
   NO OPENAI / NO OLLAMA / NO PAID AI
========================================================= */

const API = "";

let currentResearch = null;
let currentAnalysis = null;
let currentSpeech = null;
let currentSpeechRate = 1;
let quizAnswered = false;

let learningState = {
summary:false,
facts:false,
quiz:false,
save:false
};

/* =========================================================
   QUICK SEARCH
========================================================= */

function quickSearch(topic){
$("questionInput").value = topic;
researchTopic();
}

const questionInput = $("questionInput");

if (questionInput) {

    questionInput.addEventListener("keydown", function (event) {

        if (event.key === "Enter") {
            researchTopic();
        }

    });

}
/* =========================================================
   API
========================================================= */

async function getJSON(url){

const response = await fetch(url,{
headers:{
"Accept":"application/json"
}
});

let data = null;

try{
data = await response.json();
}catch{
throw new Error("Sunucudan geçerli JSON cevabı alınamadı.");
}

if(!response.ok){
throw new Error(
data?.error ||
data?.message ||
"Sunucu isteği reddetti."
);
}

return data;
}

/* =========================================================
   RESEARCH
========================================================= */

async function researchTopic() {

    const input = $("questionInput");

    const question = input
        ? input.value.trim()
        : "";

    if (!question) {
        showError("✨ Önce bana bir konu veya soru yaz.");
        return;
    }

    hideError();
    showLoading(true);

    const results = $("results");
    const searchButton = $("searchButton");
    const statusText = $("statusText");
    const loadingText = $("loadingText");
    const progressBar = $("brainProgressBar");
    const brainPercent = $("brainPercent");

    if (results) {

       results.classList.add("hidden");
       results.classList.remove("visible");

    }

    if (searchButton) {
        searchButton.disabled = true;
    }

    if (statusText) {
        statusText.textContent =
            "Brain Engine araştırıyor...";
    }

    resetLearning();

    const loadingMessages = [

        "🧠 Brain Engine soruyu analiz ediyor...",
        "🔍 Konunun bağlamı çözümleniyor...",
        "🌍 Güvenilir bilgi kaynakları taranıyor...",
        "🖼️ Görseller hazırlanıyor...",
        "🧠 Hafızadaki bilgiler eşleştiriliyor...",
        "📚 Öğretici içerik oluşturuluyor...",
        "🗺️ Bilgi haritası hazırlanıyor...",
        "🎯 Mini quiz oluşturuluyor...",
        "✨ Son dokunuşlar yapılıyor..."

    ];

    let index = 0;
    let progress = 0;

    const timer = setInterval(() => {

        if (loadingText) {
            loadingText.textContent =
                loadingMessages[index % loadingMessages.length];
        }

        progress += 16;

        if (progress > 100) {
            progress = 100;
        }

        if (progressBar) {
            progressBar.style.width =
                progress + "%";
        }

        if (brainPercent) {
            brainPercent.textContent =
                progress + "%";
        }

        index++;

    }, 700);

    try {

        console.log("🚀 researchTopic başladı");

        const data = await getJSON(

            API +
            "/api/research?q=" +
            encodeURIComponent(question)

        );

        console.log("✅ RESEARCH DATA:", data);

        currentResearch = data;

        try {

            const analysisData = await getJSON(

                API +
                "/api/analyze?q=" +
                encodeURIComponent(question)

            );

            console.log(
                "✅ ANALYZE DATA:",
                analysisData
            );

            currentAnalysis =
                analysisData.analysis ||
                analysisData;

        }
        catch (error) {

            console.warn(
                "Analyze endpoint:",
                error
            );

            currentAnalysis =
                data.analysis || {};

        }

        if (progressBar) {
            progressBar.style.width = "100%";
        }

        if (brainPercent) {
            brainPercent.textContent = "100%";
        }

        if (loadingText) {
            loadingText.textContent =
                "✅ Araştırma tamamlandı.";
        }

        await new Promise(resolve =>
            setTimeout(resolve, 500)
        );

        console.log(
            "🧠 renderResearch başlıyor..."
        );

        renderResearch(data);

        console.log(
            "✅ renderResearch tamamlandı."
        );

        /*
        ŞİMDİLİK KAPALI
        Önce araştırmanın tamamen
        çalıştığını doğrulayalım.
        */

        // await loadMemory(question, data);

        if (results) {

           results.classList.remove("hidden");
           results.classList.add("visible");

        }
        console.log(
            "✅ Results görünür yapıldı."
        );

        const sections =
            document.querySelectorAll(
                "#results .section"
            );

        sections.forEach(section =>
            section.classList.remove("show")
        );

        sections.forEach((section, index) => {

            setTimeout(() => {

                section.classList.add("show");

            }, index * 180);

        });

        if (statusText) {
            statusText.textContent =
                "Brain Engine hazır";
        }

        if (results) {

            window.scrollTo({

                top:
                    results.offsetTop - 20,

                behavior:
                    "smooth"

            });

        }

    }
    catch (error) {

        console.error(
            "❌ researchTopic Hatası:",
            error
        );

        showError(

            "⚠️ Araştırma sırasında bir sorun oluştu:\n\n" +

            error.message

        );

        if (statusText) {

            statusText.textContent =
                "Bağlantı sorunu";

        }

    }
    finally {

        clearInterval(timer);

        if (progressBar) {
            progressBar.style.width = "0%";
        }

        if (brainPercent) {
            brainPercent.textContent = "0%";
        }

        showLoading(false);

        if (searchButton) {
            searchButton.disabled = false;
        }

    }

}

/* =========================================================
   MAIN RENDER
========================================================= */

function renderResearch(data){

 const required = [
        "topicTitle",
        "topicQuestion",
        "topicCategory",
        "analysisType",
        "analysisSubject",
        "analysisIntent",
        "summaryText",
        "heroSummary",
        "heroCategory",
        "heroSources",
        "heroImages",
        "heroFacts",
        "teacherSimple",
        "teacherDetailed",
        "teacherAnalogy",
        "teacherExamples",
        "factsContainer",
        "interestingText",
        "topicImageBox",
        "imagesContainer",
        "quizQuestion",
        "quizOptions",
        "quizResult",
        "relatedContainer",
        "followContainer",
        "researchStats",
        "sourcesContainer",
        "knowledgeMap"
    ];

    for(const id of required){

        if(!$(id)){
            console.error("Eksik HTML id:", id);

        }

    }

    if(!$("topicTitle")) return;
    if(!$("summaryText")) return;

const analysis =
currentAnalysis ||
data.analysis ||
{};

const brain =
data.brain ||
{};

const ai =
data.ai ||
{};

$("topicTitle").textContent =
data.title ||
analysis.topic ||
brain.understoodTopic ||
"Yapay Zeka Araştırması";

$("topicQuestion").textContent =
data.query ||
analysis.original ||
"";

$("topicCategory").textContent =
categoryLabel(
analysis.subject ||
analysis.topic ||
brain.category ||
"araştırma"
);

$("analysisType").textContent =
analysis.type ||
brain.questionType ||
"Genel";

$("analysisSubject").textContent =
analysis.topic ||
analysis.subject ||
brain.understoodTopic ||
data.title ||
"—";

$("analysisIntent").textContent =
analysis.intent ||
brain.intent ||
"Bilgi";

renderTopicImage(data);

let summary =
safeText(ai.summary) ||
safeText(brain.summary) ||
safeText(data.summary);

if(!summary){
summary = createFallbackSummary(data);
}

typeWriter($("summaryText"), summary);

const heroSummary = $("heroSummary");

if (heroSummary) {

    heroSummary.textContent = summary;

}

$("heroCategory").textContent =
    analysis.subject ||
    brain.category ||
    "Genel";

$("heroSources").textContent =
    data.articles?.length || 0;

$("heroImages").textContent =
    data.images?.length || 0;

$("heroFacts").textContent =
    brain.facts?.length || 0;

const teacherSimple = $("teacherSimple");

if (teacherSimple) {

    typeWriter(
        teacherSimple,
        ai.lesson?.simple ||
        createSimpleLesson(
            $("topicTitle").textContent
        )
    );

}
const teacherDetailed = $("teacherDetailed");

if (teacherDetailed) {

    teacherDetailed.textContent =
        ai.lesson?.detailed ||
        createDetailedLesson(
            $("topicTitle").textContent,
            summary
        );

}

$("teacherAnalogy").textContent =
    ai.lesson?.analogy ||
    createAnalogy(
        $("topicTitle").textContent
    );

const examplesBox = $("teacherExamples");

if (examplesBox) {

    examplesBox.innerHTML = "";

    if (Array.isArray(ai.lesson?.examples)) {

        ai.lesson.examples.forEach(example => {

            const div = document.createElement("div");
            div.className = "fact-card";
            div.textContent = "• " + example;

            examplesBox.appendChild(div);

        });

    } else {

        examplesBox.innerHTML = "<p>Örnek bulunamadı.</p>";

    }

}

let facts =
Array.isArray(ai.facts) && ai.facts.length
? ai.facts
: Array.isArray(brain.facts)
? brain.facts
: Array.isArray(data.facts)
? data.facts
: [];

renderFacts(facts,data);

const interestingBox = $("interestingText");

if(interestingBox){

   const interestingText = $("interestingText");

if (interestingText) {

    interestingText.textContent =
        safeText(ai.interesting) ||
        safeText(brain.interesting) ||
        safeText(data.interesting) ||
        getInterestingFact(
            $("topicTitle").textContent
        );
   }
}

const interestingFacts={

"yapay zeka":[

"💡 Yapay zekâ terimi ilk kez 1956 yılında Dartmouth Konferansı'nda kullanıldı.",

"💡 Günümüzde akıllı telefon kameralarının çoğunda yapay zekâ bulunur.",

"💡 Büyük dil modelleri milyarlarca kelime üzerinde eğitilir."

],

"mars":[

"💡 Mars'ta bir gün Dünya'dan yalnızca yaklaşık 37 dakika daha uzundur.",

"💡 Mars'ın iki uydusu vardır: Phobos ve Deimos."

],

"aslan":[

"💡 Aslan sürülerinde avlanmayı çoğunlukla dişi aslanlar yapar."

]

};

function getInterestingFact(topic){

const key=topic.toLowerCase();

for(const item in interestingFacts){

if(key.includes(item)){

const list=interestingFacts[item];

return list[
Math.floor(Math.random()*list.length)
];

}

}

return "💡 Her yeni araştırma, bir sonraki öğrenmenin temelini oluşturur.";

}

renderImages(
data.images ||
data.imageResults ||
data.wikimedia ||
[]
);

const quiz =
ai.quiz ||
brain.quiz ||
data.quiz ||
null;

renderQuiz(quiz,data);

const related =
normalizeList(
ai.relatedTopics ||
data.related ||
data.relatedTopics ||
brain.relatedTopics ||
[]
);

renderKnowledgeMap(
    ai.knowledgeMap || {}
);

renderRelated(related);

const followUps =
normalizeList(
data.followUpQuestions ||
data.followUps ||
data.followupQuestions ||
brain.followUpQuestions ||
ai.followUpQuestions ||
[]
);

renderFollowUps(
followUps.length
? followUps
: generateFollowUps(analysis,data)
);

renderStats(data);

renderSources(data);

updateSaveButton();

}
/* =========================================================
   AI LESSON ENGINE
========================================================= */

function createSimpleLesson(topic){

return `

${topic} konusunu ilk kez öğrenen biri gibi düşünelim.

Bu konunun temel amacı ne olduğunu anlamaktır.

Daha sonra nasıl çalıştığını öğrenmek çok daha kolay olacaktır.

`;

}

function createDetailedLesson(topic,summary){

const sentences = summary
.replace(/\n/g," ")
.split(/(?<=[.!?])\s+/)
.filter(Boolean);

return `

📖 ${topic}

━━━━━━━━━━━━━━━━━━━━━━

⚙️ Çalışma Mantığı

${sentences[0] || "Bu konu belirli prensiplere göre çalışır."}

━━━━━━━━━━━━━━━━━━━━━━

🌍 Kullanım Alanları

${sentences[1] || "Günlük yaşamda ve birçok farklı alanda kullanılmaktadır."}

━━━━━━━━━━━━━━━━━━━━━━

⭐ Avantajları

• Öğrenmeyi kolaylaştırır

• Zamandan tasarruf sağlar

• Bilgiye hızlı ulaşmayı sağlar

━━━━━━━━━━━━━━━━━━━━━━

⚠️ Dikkat Edilecekler

• Bilgiyi güvenilir kaynaklardan doğrulamak önemlidir.

• Her bilgi her durumda geçerli olmayabilir.

`;

}

function createAnalogy(topic){

const t = topic.toLowerCase();

if(t.includes("yapay")){

return `

Yapay zekâyı yeni işe başlayan bir çalışan gibi düşünebilirsin.

Ne kadar çok örnek görürse o kadar başarılı olur.

`;

}

if(t.includes("mars")){

return `

Mars'ı Dünya'nın daha soğuk kardeşi gibi düşünebilirsin.

`;

}

if(t.includes("aslan")){

return `

Aslan bir futbol takımının kaptanı gibidir.

Sürüyü yönetir ve korur.

`;

}

return `

${topic} konusunu günlük hayatta kullandığın bir araç gibi düşünebilirsin.

Her aracın bir görevi olduğu gibi bunun da bir amacı vardır.

`;

}
/* =========================================================
   TOPIC IMAGE
========================================================= */

function renderTopicImage(data){

const box = $("topicImageBox");

const direct =
getImageUrl(
data.image ||
data.topicImage ||
firstImage(data.images)
);

if(direct){

loadImageWithFallback(
box,
direct,
data.title ||
currentAnalysis?.topic ||
"Yaşayan Defter"
);

return;
}

loadWikimediaImage(
currentAnalysis?.topic ||
data.title ||
data.query
)
.then(url=>{

if(url){

loadImageWithFallback(
box,
url,
data.title || "Yaşayan Defter"
);

}else{

showNoImage(box);

}

});

}

/* =========================================================
   IMAGE URL NORMALIZATION
========================================================= */

function getImageUrl(item){

if(!item) return "";

if(typeof item === "string") return item;

return (
item.thumbnail ||
item.thumb ||
item.image ||
item.url ||
item.imageUrl ||
item.src ||
item.source ||
""
);

}

function loadImageWithFallback(box,url,alt){

const img = new Image();

img.onload = function(){

box.innerHTML = "";

img.alt = alt;
img.loading = "lazy";

box.appendChild(img);

};

img.onerror = function(){

const topic =
currentAnalysis?.topic ||
currentResearch?.title ||
"";

loadWikimediaImage(topic)
.then(fallback=>{

if(fallback){

loadImageWithFallback(
box,
fallback,
alt
);

}else{

showNoImage(box);

}

});

};

img.src = url;

}

function showNoImage(box){

box.innerHTML =
'<div style="display:grid;place-items:center;height:100%;min-height:200px;color:#718096;font-size:13px">🖼️ Görsel bulunamadı</div>';

}

/* =========================================================
   WIKIMEDIA FALLBACK
========================================================= */

async function loadWikimediaImage(topic){

if(!topic) return "";

try{

const url =
"https://commons.wikimedia.org/w/api.php?" +
"action=query&generator=search&gsrsearch=" +
encodeURIComponent(topic) +
"&gsrnamespace=6&gsrlimit=8" +
"&prop=imageinfo&iiprop=url|mime" +
"&iiurlwidth=900&format=json&origin=*";

const data = await fetch(url).then(r=>r.json());

const pages =
Object.values(data.query?.pages || {});

for(const page of pages){

const info = page.imageinfo?.[0];

if(
info &&
info.thumburl &&
info.mime &&
info.mime.startsWith("image/")
){

return info.thumburl;

}

}

}catch(error){

console.warn("Wikimedia fallback:",error);

}

return "";

}

/* =========================================================
   SUMMARY
========================================================= */

function createFallbackSummary(data){

const text =
safeText(
data.text ||
data.content ||
data.extract
);

if(!text){

return "Bu konu hakkında araştırma sonuçları bulundu. Temel bilgiler, görseller ve kaynaklar üzerinden konuyu inceleyebilirsin.";

}

return createSmartSummary(text);

}

function createSmartSummary(text){

const sentences = text
.split(/(?<=[.!?])\s+/)
.filter(x => x.length > 30);

return sentences.slice(0,3).join(" ");

}

/* =========================================================
   FACTS
========================================================= */

function renderFacts(facts,data){

const container = $("factsContainer");

container.innerHTML = "";

if(!Array.isArray(facts) || !facts.length){

const fallback =
safeText(
data.text ||
data.content ||
data.extract
);

if(fallback){

container.innerHTML =
'<div class="fact">' +
'<div class="fact-type">BİLGİ</div>' +
'<h4>Temel bilgi</h4>' +
'<p>' +
escapeHTML(fallback.slice(0,1000)) +
'</p></div>';

return;

}

container.innerHTML =
'<div class="fact">' +
'<h4>Temel bilgi hazırlanıyor</h4>' +
'<p>Bu araştırmada henüz ayrı bilgi kartı bulunamadı.</p>' +
'</div>';

return;

}
const factTemplates = [

    { type: "📖", title: "Tanım" },

    { type: "⚙️", title: "Çalışma Mantığı" },

    { type: "🌍", title: "Kullanım Alanı" },

    { type: "⭐", title: "Avantaj" },

    { type: "⚠️", title: "Dikkat Edilecekler" }

];
facts.slice(0,5).forEach((fact,index)=>{

    let text = "";

    if(typeof fact === "string"){

        text = fact;

    }else{

        text =
        safeText(fact.text) ||
        safeText(fact.description) ||
        safeText(fact.content) ||
        safeText(fact.value);

    }

    if(!text) return;

    const template =
        factTemplates[index] ||
        factTemplates[factTemplates.length-1];

    // Aynı cümleleri parçala
    const sentences = text
        .split(/(?<=[.!?])\s+/)
        .filter(s => s.length > 15);

    let finalText = "";

    switch(template.title){

        case "Tanım":
            finalText =
                sentences[0] ||
                text;
            break;

        case "Çalışma Mantığı":
            finalText =
                sentences.slice(1,3).join(" ");

            if(!finalText)
                finalText =
                "Bu konu belirli bir çalışma mantığına göre işler.";
            break;

        case "Kullanım Alanı":
            finalText =
                "Bu konu eğitim, bilim, teknoloji ve günlük yaşam gibi birçok alanda kullanılmaktadır.";
            break;

        case "Avantaj":
            finalText =
                "Bilgiye daha hızlı ulaşmayı sağlar ve öğrenmeyi kolaylaştırır.";
            break;

        case "Dikkat Edilecekler":
            finalText =
                "Bilgilerin güvenilir kaynaklardan doğrulanması önemlidir.";
            break;

        default:
            finalText = text;

    }

    const element =
        document.createElement("div");

    element.className = "fact";

    element.innerHTML =

        '<div class="fact-type">' +
        template.type +
        '</div>' +

        '<h4>' +
        template.title +
        '</h4>' +

        '<p>' +
        escapeHTML(finalText) +
        '</p>';

    container.appendChild(element);

});

}

function getFactType(index,title){

const lower =
safeText(title).toLocaleLowerCase("tr-TR");

if(lower.includes("tanım")) return "TANIM";
if(lower.includes("neden")) return "NEDEN";
if(lower.includes("özellik")) return "ÖZELLİK";
if(lower.includes("bilim")) return "BİLİMSEL BİLGİ";

return [
"BİLGİ",
"TEMEL BİLGİ",
"ÖZELLİK",
"BİLİMSEL BİLGİ",
"BİLGİ"
][index % 5];

}

/* =========================================================
   IMAGES
========================================================= */

function renderImages(images){

const container = $("imagesContainer");

container.innerHTML = "";

const normalized =
Array.isArray(images)
? images
.map(item => ({
    url: getImageUrl(item),
    title:
        typeof item === "string"
        ? ""
        : safeText(
            item.title ||
            item.name ||
            item.caption
        )
}))
.filter(x => {

    if(!x.url) return false;

    const t = x.title.toLowerCase();

    const blocked = [

        "pdf",
        "page",
        "crop",
        "thumbnail",
        "airport",
        "havalimanı",
        "baraj",
        "dam",
        "school",
        "lisesi",
        "logo",
        "icon"

    ];

    return !blocked.some(word => t.includes(word));

})
.slice(0,6)
: [];
if(!normalized.length){

const topic =
currentAnalysis?.topic ||
currentResearch?.title ||
currentResearch?.query ||
"";

loadWikimediaGallery(topic);

return;

}

normalized.forEach(item=>{

const card =
document.createElement("div");

card.className = "image-card";

const img =
document.createElement("img");

img.alt =
item.title || "Yaşayan Defter görseli";

img.loading = "lazy";

img.src = item.url;

img.onerror = async function(){

const fallback =
await loadWikimediaImage(
currentAnalysis?.topic ||
currentResearch?.title
);

if(fallback && img.src !== fallback){

img.src = fallback;

}else{

card.style.display = "none";

}

};

card.appendChild(img);

if(item.title){

const caption =
document.createElement("div");

caption.className = "image-caption";
caption.textContent = item.title;

card.appendChild(caption);

}

container.appendChild(card);

});

}

async function loadWikimediaGallery(topic){

const container = $("imagesContainer");

try{

const url =
"https://commons.wikimedia.org/w/api.php?" +
"action=query&generator=search&gsrsearch=" +
encodeURIComponent(topic) +
"&gsrnamespace=6&gsrlimit=12" +
"&prop=imageinfo&iiprop=url|mime" +
"&iiurlwidth=700&format=json&origin=*";

const data =
await fetch(url).then(r=>r.json());

const pages =
Object.values(data.query?.pages || {});

const images =
pages
.map(page=>{
const info = page.imageinfo?.[0];

return {
url:info?.thumburl || info?.url || "",
title:page.title?.replace(/^File:/,"") || ""
};

})
.filter(x=>x.url);

if(images.length){

renderImages(images);

return;

}

}catch(error){

console.warn("Wikimedia gallery:",error);

}

container.innerHTML =
'<div class="fact" style="grid-column:1/-1">' +
'<h4>Görsel bulunamadı</h4>' +
'<p>Wikimedia Commons üzerinde bu konu için uygun görsel bulunamadı.</p>' +
'</div>';

}

function firstImage(images){

if(!Array.isArray(images)) return "";

for(const item of images){

const url = getImageUrl(item);

if(url) return url;

}

return "";

}

/* =========================================================
   QUIZ
========================================================= */

function renderQuiz(quiz,data){

const question = $("quizQuestion");
const options = $("quizOptions");
const result = $("quizResult");

options.innerHTML = "";
result.textContent = "";
result.className = "quiz-result";

quizAnswered = false;

if(
!quiz ||
!quiz.question ||
!Array.isArray(quiz.options)
){

quiz = createFallbackQuiz(data);

}

if(!quiz){

question.textContent =
"Bu araştırmada henüz quiz oluşturulamadı.";

return;

}

currentResearch.quiz = quiz;

question.textContent = quiz.question;

const correct =
quiz.correct ||
quiz.answer ||
quiz.correctAnswer;

quiz.options.slice(0,4).forEach(option=>{

const button =
document.createElement("button");

button.className = "quiz-option";
button.textContent =
typeof option === "string"
? option
: option.text || option.label || "";

button.onclick = function(){

answerQuiz(
button.textContent,
correct,
button
);

};

options.appendChild(button);

});

}

function createFallbackQuiz(data){

const title =
data.title ||
currentAnalysis?.topic;

if(!title) return null;

return {
question:
title +
" konusu hakkında araştırmada verilen temel açıklamaya göre hangisi doğrudur?",
options:[
"Yukarıdaki araştırma açıklaması konunun bilimsel temelini anlatır.",
"Bu konu hakkında hiçbir bilimsel çalışma yoktur.",
"Bu konu tamamen hayal ürünüdür.",
"Bu konu hakkında kaynak bulunamaz."
],
correct:
"Yukarıdaki araştırma açıklaması konunun bilimsel temelini anlatır."
};

}

function answerQuiz(selected,correct,clicked){

if(quizAnswered) return;

quizAnswered = true;

document
.querySelectorAll(".quiz-option")
.forEach(button=>{

if(
correct &&
button.textContent === correct
){

button.classList.add("correct");

}

});

if(
correct &&
selected === correct
){

clicked.classList.add("correct");

$("quizResult").textContent =
"🎉 Doğru! Konuyu yakaladın.";

$("quizResult").className =
"quiz-result good";

completeStep("quiz");

}else{

clicked.classList.add("wrong");

$("quizResult").textContent =
correct
? "💡 Henüz değil. Doğru cevap: " + correct
: "💡 Cevabın kaydedildi. Konuyu tekrar inceleyebilirsin.";

$("quizResult").className =
"quiz-result bad";

}

}

/* =========================================================
   FOLLOW UP
========================================================= */

function generateFollowUps(analysis,data){

const topic =
analysis.topic ||
data.title ||
"bu konu";

const type =
analysis.type ||
"genel";

if(type === "neden"){

return [
topic + " nasıl oluşur?",
topic + " hangi sonuçlara yol açar?",
topic + " ne zaman keşfedildi?",
topic + " ile ilgili en önemli bilimsel bilgiler nelerdir?"
];

}

if(type === "nasıl"){

return [
topic + " neden oluşur?",
topic + " nasıl çalışır?",
topic + " hangi özelliklere sahiptir?",
topic + " ile ilgili ilginç bilgiler nelerdir?"
];

}

return [
topic + " nedir?",
topic + " nasıl çalışır?",
topic + " neden önemlidir?",
topic + " hakkında hangi bilimsel bilgiler biliniyor?"
];

}

function renderFollowUps(items){

    const container = $("followContainer");

    if(!container){
        return;
    }

    container.innerHTML = "";

    if(!Array.isArray(items) || !items.length){

        container.innerHTML =
        '<div class="fact" style="grid-column:1/-1">' +
        '<h4>Takip sorusu hazırlanıyor</h4>' +
        '<p>Bu konudan devam ederek yeni bir soru sorabilirsin.</p>' +
        '</div>';

        return;

    }

    items.forEach(item=>{

        const button = document.createElement("button");

        button.className = "follow-btn";

        button.textContent = item;

        button.onclick = () => {

            const input = $("q");

            if(input){

                input.value = item;

            }

            researchTopic();

        };

        container.appendChild(button);

    });

}

/* =========================================================
   RELATED
========================================================= */

function normalizeList(value){

if(!Array.isArray(value)) return [];

return value
.map(item=>{

if(typeof item === "string"){

return {
title:item,
url:""
};

}

return {
title:
item?.title ||
item?.name ||
item?.topic ||
item?.question ||
item?.text ||
"",
url:
item?.url ||
item?.link ||
""
};

})
.filter(item=>item.title);

}
function renderKnowledgeMap(map){

    const container = $("knowledgeMap");

    if(!container) return;

    container.innerHTML = "";

    if(!map.nodes || !map.nodes.length){

        container.innerHTML =
            "<p>Bilgi haritası hazırlanıyor...</p>";

        return;

    }

    map.nodes.forEach(node=>{

        const button =
            document.createElement("button");

        button.className = "map-node";

        button.textContent = node;

        button.onclick = function(){

            $("questionInput").value = node;

            researchTopic();

        };

        container.appendChild(button);

    });

}

function renderRelated(items){

const container = $("relatedContainer");

container.innerHTML = "";

if(!items.length){

container.innerHTML =
'<div class="fact" style="grid-column:1/-1">' +
'<h4>Yeni bağlantılar hazırlanıyor</h4>' +
'<p>Bu konu için henüz ilişkili başlık bulunamadı.</p>' +
'</div>';

return;

}

items.slice(0,12).forEach(item=>{

const button =
document.createElement("button");

button.className = "related-btn";

button.innerHTML =
'<div class="related-icon">🔗</div>' +
'<div>' +
escapeHTML(item.title) +
'</div>';

button.onclick = ()=>{

if(item.url){

window.open(
item.url,
"_blank",
"noopener,noreferrer"
);

}else{

$("questionInput").value = item.title;
researchTopic();

}

};

container.appendChild(button);

});

}

/* =========================================================
   MEMORY ENGINE 10.0
========================================================= */

async function loadMemory(question,data){

const container =
$("memoryContainer");

container.innerHTML = "";

let memoryItems = [];

const backendMemory =
data.memory ||
data.memoryContext ||
data.relatedMemory ||
data.memoryResults ||
data.brain?.memoryContext ||
currentAnalysis?.memoryContext;

if(backendMemory){

if(Array.isArray(backendMemory)){

memoryItems.push(...backendMemory);

}else{

memoryItems.push(backendMemory);

}

}

/*
Backend araştırma sonucunda memory dönmediyse
ayrı memory/search endpoint'ini kullan.
*/

try{

const memoryData =
await getJSON(
API +
"/api/memory/search?q=" +
encodeURIComponent(question)
);

const results =
memoryData.results ||
memoryData.memory ||
memoryData.items ||
memoryData.data ||
[];

if(Array.isArray(results)){

memoryItems.push(...results);

}else if(results){

memoryItems.push(results);

}

}catch(error){

console.warn("Memory search:",error);

}

const unique = [];

const seen = new Set();

memoryItems.forEach(item=>{

const text =
typeof item === "string"
? item
: item?.text ||
item?.content ||
item?.summary ||
item?.title ||
item?.topic ||
"";

if(!text) return;

const key =
text.toLocaleLowerCase("tr-TR");

if(seen.has(key)) return;

seen.add(key);

unique.push({
title:
typeof item === "string"
? "Geçmiş öğrenme"
: item.title ||
item.topic ||
"Geçmiş öğrenme",

text
});

});

if(!unique.length){

container.innerHTML =
'<div class="memory-card">' +
'<strong>🧠 Yeni öğrenme</strong>' +
'<p>Bu konu için geçmiş hafızada bağlantılı bir kayıt bulunamadı. Bu araştırmayı kaydettiğinde ileride yeniden kullanılabilecek.</p>' +
'</div>';

return;

}

unique.slice(0,6).forEach(item=>{

const card =
document.createElement("div");

card.className = "memory-card";

card.innerHTML =
'<strong>🧠 ' +
escapeHTML(item.title) +
'</strong>' +
'<p>' +
escapeHTML(item.text) +
'</p>';

container.appendChild(card);

});

}

/* =========================================================
   STATS
========================================================= */

function renderStats(data){

const container = $("researchStats");

const articles =
Array.isArray(data.articles)
? data.articles.length
: Number(data.stats?.articles || 0);

const images =
Array.isArray(data.images)
? data.images.length
: Number(data.stats?.images || 0);

const facts =
Array.isArray(data.brain?.facts)
? data.brain.facts.length
: Array.isArray(data.ai?.facts)
? data.ai.facts.length
: Array.isArray(data.facts)
? data.facts.length
: Number(data.stats?.facts || 0);

const sources =
Array.isArray(data.sources)
? data.sources.length
: Number(data.stats?.sources || 0);

container.innerHTML =

statCard("📚","Araştırma kaynağı",articles) +
statCard("🖼️","Görsel",images) +
statCard("🧠","Temel bilgi",facts) +
statCard("🔗","Kaynak",sources);

}

function statCard(icon,label,value){

return `
<div class="analysis-card">
<div class="analysis-label">${icon} ${escapeHTML(label)}</div>
<div class="analysis-value">${escapeHTML(value)}</div>
</div>
`;

}

/* =========================================================
   SOURCES
========================================================= */

function renderSources(data){

const container = $("sourcesContainer");

container.innerHTML = "";

const sourceMap = new Map();

function addSource(title,url){

if(!url) return;

try{

new URL(url);

}catch{

return;

}

sourceMap.set(
title || "Kaynak",
url
);

}

addSource(
data.title ||
currentAnalysis?.topic ||
"Ana kaynak",
data.url ||
data.sourceUrl
);

if(Array.isArray(data.sources)){

data.sources.forEach(item=>{

if(typeof item === "string"){

addSource("Kaynak",item);

}else{

addSource(
item.title ||
item.name ||
item.source ||
"Kaynak",
item.url ||
item.link
);

}

});

}

if(Array.isArray(data.articles)){

data.articles.slice(0,20).forEach(article=>{

if(article){

addSource(
article.title ||
article.source ||
"Kaynak",
article.url ||
article.link
);

}

});

}

if(!sourceMap.size){

container.innerHTML =
'<div class="fact">' +
'<h4>Kaynak bağlantısı bulunamadı</h4>' +
'<p>Araştırma sonuçları kullanılabilir durumda.</p>' +
'</div>';

return;

}

sourceMap.forEach((url,title)=>{

const row =
document.createElement("div");

row.className = "source-item";

row.innerHTML =
'<div class="source-name">' +
escapeHTML(title) +
'</div>' +

'<a class="source-link" href="' +
escapeHTML(url) +
'" target="_blank" rel="noopener noreferrer">' +
"Kaynağı aç →" +
"</a>";

container.appendChild(row);

});

}

/* =========================================================
   CATEGORY
========================================================= */

function categoryLabel(value){

const text =
safeText(value)
.toLocaleLowerCase("tr-TR");

if(
text.includes("uzay") ||
text.includes("astronomi") ||
text.includes("kara delik") ||
text.includes("mars")
){

return "Uzay ve Astronomi";

}

if(
text.includes("insan") ||
text.includes("biyoloji")
){

return "Biyoloji ve İnsan";

}

if(
text.includes("tarih") ||
text.includes("osmanlı")
){

return "Tarih";

}

if(text.includes("yapay")){

return "Teknoloji ve Yapay Zeka";

}

if(
text.includes("rüya") ||
text.includes("psikoloji")
){

return "Zihin ve Davranış";

}

return value || "Araştırma";

}

/* =========================================================
   INTERESTING
========================================================= */

function createInterestingFallback(data){

const facts =
data.ai?.facts ||
data.brain?.facts ||
data.facts ||
[];

if(Array.isArray(facts) && facts.length){

const first = facts[0];

if(typeof first === "string") return first;

return (
safeText(first.title) +
": " +
safeText(
first.text ||
first.description ||
first.content
)
);

}

return "Bu araştırma konusuyla ilgili yeni bir bağlantıyı keşfedebilirsin.";

}

/* =========================================================
   LEARNING
========================================================= */

function resetLearning(){

learningState = {
summary:false,
facts:false,
quiz:false,
save:false
};

[
"stepSummary",
"stepFacts",
"stepQuiz",
"stepSave"
].forEach(id=>{

$(id).classList.remove("done");

});

updateProgress();

}

function completeStep(step){

if(!Object.prototype.hasOwnProperty.call(
learningState,
step
)) return;

learningState[step] = true;

const buttonMap = {
summary:"stepSummary",
facts:"stepFacts",
quiz:"stepQuiz",
save:"stepSave"
};

if(buttonMap[step]){

$(buttonMap[step])
.classList.add("done");

}

updateProgress();

}

function updateProgress(){

const values =
Object.values(learningState);

const completed =
values.filter(Boolean).length;

const percent =
Math.round(
completed /
values.length *
100
);

$("progressPercent").textContent =
percent + "%";

$("progressFill").style.width =
percent + "%";

}

/* =========================================================
   VOICE
========================================================= */

function speakText(text){

if(!("speechSynthesis" in window)){

showError(
"Tarayıcın sesli anlatımı desteklemiyor."
);

return;

}

stopVoice();

const clean = safeText(text);

if(!clean) return;

currentSpeech =
new SpeechSynthesisUtterance(clean);

currentSpeech.lang = "tr-TR";
currentSpeech.rate = currentSpeechRate;
currentSpeech.pitch = 1;
currentSpeech.volume = 1;

currentSpeech.onstart = ()=>{

$("voiceStatus").textContent =
"🔊 Anlatıyor...";

};

currentSpeech.onend = ()=>{

$("voiceStatus").textContent =
"Anlatım tamamlandı.";

};

currentSpeech.onerror = ()=>{

$("voiceStatus").textContent =
"Sesli anlatım durdu.";

};

speechSynthesis.speak(currentSpeech);

}

function speakSummary(){

speakText(
$("summaryText").textContent
);

}

function speakFacts(){

const facts =
currentResearch?.ai?.facts ||
currentResearch?.brain?.facts ||
currentResearch?.facts ||
[];

const text =
facts.map(f=>{

if(typeof f === "string") return f;

return (
safeText(f.title) +
". " +
safeText(
f.text ||
f.description ||
f.content
)
);

}).join(" ");

speakText(text);

}

function speakInteresting(){

speakText(
$("interestingText").textContent
);

}

function pauseVoice(){

if("speechSynthesis" in window){

speechSynthesis.pause();

$("voiceStatus").textContent =
"⏸️ Duraklatıldı.";

}

}

function resumeVoice(){

if("speechSynthesis" in window){

speechSynthesis.resume();

$("voiceStatus").textContent =
"▶️ Devam ediyor...";

}

}

function stopVoice(){

if("speechSynthesis" in window){

speechSynthesis.cancel();

}

$("voiceStatus").textContent =
"Durduruldu.";

}

function changeVoiceSpeed(){

currentSpeechRate =
Number($("voiceSpeed").value);

if(
currentSpeech &&
speechSynthesis.speaking
){

speechSynthesis.cancel();

speakSummary();

}

}

/* =========================================================
   LOCAL NOTEBOOK
========================================================= */

function getSavedTopics(){

try{

return JSON.parse(
localStorage.getItem(
"yasayanDefterNotebook"
) || "[]"
);

}catch{

return [];

}

}

function saveCurrentTopic(){

if(!currentResearch) return;

const saved =
getSavedTopics();

const title =
currentResearch.title ||
currentAnalysis?.topic ||
"Konusuz araştırma";

const exists =
saved.some(item=>item.title === title);

if(!exists){

saved.unshift({

id:Date.now(),

title:title,

question:
currentResearch.query ||
currentAnalysis?.original ||
"",

summary:
currentResearch.ai?.summary ||
currentResearch.brain?.summary ||
currentResearch.summary ||
$("summaryText").textContent,

facts:
currentResearch.ai?.facts ||
currentResearch.brain?.facts ||
currentResearch.facts ||
[],

interesting:
currentResearch.ai?.interesting ||
currentResearch.brain?.interesting ||
currentResearch.interesting ||
$("interestingText").textContent,

date:new Date().toLocaleString("tr-TR")

});

localStorage.setItem(
"yasayanDefterNotebook",
JSON.stringify(
saved.slice(0,50)
)
);

}

learningState.save = true;

$("stepSave").classList.add("done");

updateProgress();
updateSaveButton();
renderNotebook();

$("saveTopicButton").textContent =
"✓ Deftere kaydedildi";

$("saveTopicButton").classList.add("saved");

/*
Backend memory endpoint'i varsa,
yerel frontend kaydının yanında backend hafızasına da
göndermeyi deniyoruz.
Endpoint yoksa hata vermeden devam ediyor.
*/

try{

awaitMemorySave();

}catch(error){

console.log(
"Backend memory save kullanılmıyor:",
error.message
);

}

}

async function awaitMemorySave(){

const payload = {

title:
currentResearch.title ||
currentAnalysis?.topic ||
"",

topic:
currentAnalysis?.topic ||
currentResearch.title ||
"",

query:
currentResearch.query ||
currentAnalysis?.original ||
"",

summary:
$("summaryText").textContent,

facts:
currentResearch.ai?.facts ||
currentResearch.brain?.facts ||
currentResearch.facts ||
[],

interesting:
$("interestingText").textContent,

date:
new Date().toISOString()

};

/*
Backend'in memory/save endpoint'i yoksa
404 alınır ve ana uygulama etkilenmez.
*/

const response =
await fetch(
API + "/api/memory/save",
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify(payload)
}
);

if(!response.ok){

throw new Error(
"Memory save endpoint bulunamadı."
);

}

}

function updateSaveButton(){

if(!currentResearch) return;

const title =
currentResearch.title ||
currentAnalysis?.topic;

const saved =
getSavedTopics();

const exists =
saved.some(item=>item.title === title);

if(exists){

$("saveTopicButton").textContent =
"✓ Defterde kayıtlı";

$("saveTopicButton").classList.add("saved");

$("stepSave").classList.add("done");

learningState.save = true;

}else{

$("saveTopicButton").textContent =
"📖 Bu konuyu kaydet";

$("saveTopicButton").classList.remove("saved");

}

updateProgress();

}

function toggleNotebook(){

$("notebookList")
.classList.toggle("visible");

renderNotebook();

}

function renderNotebook(){

    const box = $("notebookList");

    if(!box) return;

    const saved = getSavedTopics();
if(!saved.length){

box.innerHTML =
'<div class="fact">' +
'<h4>Defterin henüz boş</h4>' +
'<p>Bir araştırma yap ve “Bu konuyu kaydet” düğmesine bas.</p>' +
'</div>';

return;

}

box.innerHTML = "";

saved.forEach(item=>{

const row =
document.createElement("div");

row.className = "saved-item";

row.innerHTML =
'<div>' +
'<div class="saved-title">' +
escapeHTML(item.title) +
'</div>' +
'<div class="saved-date">' +
escapeHTML(item.date || "") +
'</div>' +
'</div>' +
'<button class="delete-save">Sil</button>';

row.querySelector(".delete-save")
.onclick = event=>{

event.stopPropagation();

deleteSavedTopic(item.id);

};

row.onclick = ()=>{

loadSavedTopic(item);

};

box.appendChild(row);

});

}

function deleteSavedTopic(id){

const saved =
getSavedTopics()
.filter(item=>item.id !== id);

localStorage.setItem(
"yasayanDefterNotebook",
JSON.stringify(saved)
);

renderNotebook();
updateSaveButton();

}

function loadSavedTopic(item){

$("questionInput").value =
item.question ||
item.title;

window.scrollTo({
top:0,
behavior:"smooth"
});

researchTopic();

}

/* =========================================================
   UI
========================================================= */

function showLoading(show){

    const loading = $("loading");

    if(!loading) return;

    loading.classList.toggle("active", show);
    loading.classList.toggle("hidden", !show);

}
function showError(message){

$("errorBox").textContent = message;

$("errorBox")
.classList.add("visible");

}

function hideError(){

$("errorBox")
.classList.remove("visible");

}

/* =========================================================
   STATUS
========================================================= */

async function checkStatus(){

try{

const data =
await getJSON(
API + "/api/status"
);

if(data?.ok){

$("statusText").textContent =
"Brain Engine 10.0 hazır";

return;

}

}catch(error){

console.warn("Status endpoint:",error);

}

try{

const data =
await getJSON(
API + "/api/analyze?q=durum"
);

if(data?.ok){

$("statusText").textContent =
"Brain Engine 10.0 hazır";

return;

}

}catch(error){

console.warn("Analyze status:",error);

}

$("statusText").textContent =
"Sunucu bekleniyor";

}

/* =========================================================
   APPLICATION INITIALIZER
========================================================= */

function initializeApp() {

    renderNotebook();

    checkStatus();

    if (typeof updateClock === "function") {
        updateClock();
    }

    if (typeof animateCounter === "function") {
        animateCounter("sourceCounter",120);
        animateCounter("imageCounter",1);
        animateCounter("speedCounter",0.8);
    }

    console.log("🧠 Yaşayan Defter 13 Professional Hazır");

}

/* =========================================================
   PREMIUM BUTTON EFFECT
========================================================= */

const searchButton = document.getElementById("searchButton");
if(searchButton){

    searchButton.addEventListener("mouseenter",()=>{

        searchButton.animate([

            {
                transform:"translateY(0px) scale(1)"
            },

            {
                transform:"translateY(-4px) scale(1.05)"
            }

        ],{

            duration:220,
            fill:"forwards"

        });

    });

    searchButton.addEventListener("mouseleave",()=>{

        searchButton.animate([

            {
                transform:"translateY(-4px) scale(1.05)"
            },

            {
                transform:"translateY(0px) scale(1)"
            }

        ],{

            duration:220,
            fill:"forwards"

        });

    });

}
async function typeWriter(element,text,speed=8){

    element.innerHTML="";

    for(let i=0;i<text.length;i++){

        element.innerHTML+=text.charAt(i);

        await new Promise(r=>setTimeout(r,speed));

    }

}
