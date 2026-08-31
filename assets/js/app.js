
/* =========================================================
   YAŞAYAN DEFTER
   YAŞAYAN DEFTER 15.0 PILOT
   NO OPENAI / NO OLLAMA / NO PAID AI
========================================================= */

const API = "";

function isDemoMode() {
    return window.YasayanDefterAccess?.isDemoMode() === true;
}

function canUsePersistentApi() {
    return window.YasayanDefterAccess?.canUsePersistentApi() === true;
}

function activeStudentId() {
    if (isDemoMode()) return "";
    try { return localStorage.getItem("yasayan-defter-active-student") || ""; } catch (_) { return ""; }
}

function clearStaleStudentContext() {
    try { localStorage.removeItem("yasayan-defter-active-student"); } catch (_) {}
    window.dispatchEvent(new CustomEvent("student:updated", { detail: { studentId: "" } }));
}

let currentResearch = null;
let currentAnalysis = null;
let currentSpeech = null;
let currentSpeechRate = 1;
let quizAnswered = false;
let activeProQuiz = null;
let activeProQuizIndex = 0;
let activeProQuizAnswers = [];
let activeProQuizChecked = false;
let researchSequence = 0;
let activeResearchController = null;
let livingMemoryRequest = null;
let livingMemoryData = null;
let livingMemoryController = null;
let livingMemorySequence = 0;
let knowledgeGraphSignature = "";
let persistentNotebook = [];

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

async function getJSON(url, options = {}){

const response = await fetch(url,{
headers:{
"Accept":"application/json",
...(options.headers || {})
},
signal: options.signal
});

let data = null;

try{
data = await response.json();
}catch{
throw new Error("Sunucudan geçerli JSON cevabı alınamadı.");
}

if(!response.ok){
const errorPayload = data?.error;
const errorMessage = typeof errorPayload === "object"
? errorPayload.message
 : errorPayload;
console.error(
"API isteği başarısız:",
{
status: response.status,
url,
 code: errorPayload?.code || "",
 detail: errorMessage || data?.detail || "",
 requestId: data?.requestId || ""
}
);
if (errorPayload && typeof errorPayload === "object") {
    const requestError = new Error(errorMessage || "Sunucu isteği reddetti.");
    requestError.code = errorPayload.code || "API_ERROR";
    requestError.requestId = data?.requestId || "";
    throw requestError;
}
throw new Error(
 errorMessage ||
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
    renderKnowledgeGraphLoading();
    const sequence = ++researchSequence;
    if (activeResearchController) activeResearchController.abort();
    const controller = new AbortController();
    activeResearchController = controller;

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
    let staleContextRecovery = false;

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

        const data = await getJSON(

            API +
            "/api/research?q=" +
            encodeURIComponent(question) + (activeStudentId() ? "&studentId=" + encodeURIComponent(activeStudentId()) : ""),
            { signal: controller.signal, headers: { "X-Research-Request-Id": globalThis.crypto?.randomUUID?.() || `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0").slice(-12)}` } }

        );

        if (sequence !== researchSequence) return;
        currentResearch = data;

        if (!isDemoMode()) try {

            const analysisData = await getJSON(

                API +
                "/api/analyze?q=" +
                encodeURIComponent(question),
                { signal: controller.signal }

            );

            currentAnalysis =
                analysisData.analysis ||
                analysisData;

        }
        catch (error) {

            if (error && error.name !== "AbortError") console.warn("Analyze endpoint başarısız.");

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

        renderResearch(data);
        renderLivingMemoryResult(data);
        if (canUsePersistentApi()) refreshLivingMemoryWorkspace(true);
        window.dispatchEvent(new CustomEvent("learning:updated"));

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
        window.dispatchEvent(new CustomEvent("research:completed", { detail: { query: question, research: data } }));

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

        if (error && error.name === "AbortError") return;
        if (error && error.code === "STUDENT_NOT_FOUND" && !staleContextRecovery) {
            staleContextRecovery = true;
            clearStaleStudentContext();
            if (statusText) statusText.textContent = "Varsayılan öğrenme profiline dönülüyor...";
            setTimeout(() => researchTopic(), 0);
            return;
        }
        console.error("Araştırma isteği başarısız:", error?.message || "Bilinmeyen hata");

        showError(

            "⚠️ Araştırma sırasında bir sorun oluştu:\n\n" +

            error.message

        );
        renderKnowledgeGraphError();

        if (statusText) {

            statusText.textContent =
                "Bağlantı sorunu";

        }

    }
    finally {

        clearInterval(timer);

        if (sequence === researchSequence) {
            if (progressBar) progressBar.style.width = "0%";
            if (brainPercent) brainPercent.textContent = "0%";
            showLoading(false);
            if (searchButton) searchButton.disabled = false;
            activeResearchController = null;
        }

    }

}

/* =========================================================
   MAIN RENDER
========================================================= */

function getUniqueImages(images) {
    if (!Array.isArray(images)) return [];
    const seen = new Set();
    return images.filter(item => {
        const url = getImageUrl(item);
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
    });
}

function getSourceArticles(data) {
    const seen = new Set();
    const articles = Array.isArray(data?.articles) ? data.articles : [];
    const result = articles.filter(article => {
        const url = article?.url || article?.link || "";
        if (!url || seen.has(url)) return false;
        try { new URL(url); } catch { return false; }
        seen.add(url);
        return true;
    });
    const mainUrl = data?.url || "";
    if (mainUrl && !seen.has(mainUrl)) {
        try { new URL(mainUrl); result.push({ title: data.title, url: mainUrl }); } catch {}
    }
    return result;
}

function setCurrentEmptyLayout(currentEmpty) {
    const results = $("results");
    if (!results) return;
    results.classList.toggle("current-empty-results", currentEmpty);
    results.querySelectorAll(":scope > .section, #researchWorkspace156 .yd-research-panel > .section").forEach(section => {
        if (section.id !== "professionalResult") section.hidden = currentEmpty;
    });
    const memoryBanner = $("livingMemoryResultBanner");
    if (memoryBanner && currentEmpty) memoryBanner.hidden = true;
}
function setSectionVisibleById(id, visible) {
    const section = $(id)?.closest(".section");
    if (section) section.hidden = !visible;
}
function setCurrentVerifiedLayout(data) {
    if (data.currentState !== "CURRENT_VERIFIED") {
        if ($("teacherAnalogy")) { $("teacherAnalogy").hidden = false; const heading = $("teacherAnalogy").previousElementSibling; if (heading) heading.hidden = false; }
        return;
    }
    const facts = data.structuredContent?.keyFacts || [];
    const flashcards = data.brain?.flashcards || data.ai?.flashcards || [];
    const mapNodes = data.ai?.knowledgeMap?.nodes || [];
    setSectionVisibleById("summaryText", false);
    setSectionVisibleById("analysisType", false);
    setSectionVisibleById("memoryContainer", !isDemoMode());
    setSectionVisibleById("voiceStatus", false);
    setSectionVisibleById("factsContainer", facts.length > 0);
    setSectionVisibleById("interestingText", Boolean(data.ai?.interesting || data.brain?.interesting));
    setSectionVisibleById("imagesContainer", Array.isArray(data.images) && data.images.length > 0);
    setSectionVisibleById("flashcardsContainer", flashcards.length > 0);
    setSectionVisibleById("quizQuestion", Boolean(data.brain?.quiz || data.ai?.quiz));
    setSectionVisibleById("knowledgeMap", mapNodes.length > 0);
    setSectionVisibleById("followContainer", false);
    setSectionVisibleById("relatedContainer", false);
    setSectionVisibleById("sourcesContainer", false);
    if (isDemoMode()) setSectionVisibleById("stepSave", false);
}

function renderResearch(data){
    const currentEmpty = data.currentState === "CURRENT_EMPTY";
    setCurrentEmptyLayout(currentEmpty);
    setCurrentVerifiedLayout(data);
    renderProfessionalResult(data);
    if (currentEmpty) return;

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

const currentVerified = data.currentState === "CURRENT_VERIFIED";

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
    brain.category ||
    analysis.subject ||
    analysis.topic ||
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

if (data.researchUnavailable) {
    summary = "Bu konu için doğrulanabilir bilgi kaynağına şu anda ulaşılamadı.";
} else if(!summary){
    summary = createFallbackSummary(data);
}

function createSafeElement(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined && value !== null) element.textContent = String(value);
    return element;
}

function currentDateLabel(value, now = new Date()) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Tarih belirtilmemiş";
    const diff = now.getTime() - date.getTime();
    if (diff >= 0 && diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))} dakika önce`;
    if (diff >= 0 && diff < 86400000) return `${Math.max(1, Math.floor(diff / 3600000))} saat önce`;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const itemDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() - 86400000));
    if (itemDay === today) return `Bugün ${date.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })}`;
    if (itemDay === yesterday) return "Dün";
    return date.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}

function renderProfessionalResult(data) {
    const host = $("professionalResult");
    if (!host || !window.ResultRenderers) return;
    const model = window.ResultRenderers.buildResultViewModel(data);
    while (host.firstChild) host.removeChild(host.firstChild);

    const head = createSafeElement("div", "professional-result-head");
    const titleGroup = createSafeElement("div", "professional-result-title-group");
    const kicker = createSafeElement("p", "professional-kicker", "ARAŞTIRMA SONUCU");
    const title = createSafeElement("h2", "professional-result-title", model.title);
    title.id = "professionalResultTitle";
    const subtitle = createSafeElement("p", "professional-result-subtitle", model.query ? `“${model.query}” için yapılandırılmış öğrenme içeriği` : "Yapılandırılmış öğrenme içeriği");
    titleGroup.append(kicker, title, subtitle);
    const meta = createSafeElement("div", "professional-result-meta");
    const audience = createSafeElement("span", "professional-badge", `Seviye: ${model.audienceLevel}`);
    meta.appendChild(audience);
    if (data && data.researchMode === "current") {
        meta.appendChild(createSafeElement("span", "professional-badge professional-current-badge", "⚡ Güncel Bilgi"));
        const checkedAt = data.freshness && data.freshness.checkedAt ? new Date(data.freshness.checkedAt) : null;
        const checkedText = checkedAt && !Number.isNaN(checkedAt.getTime()) ? `Son kontrol: ${checkedAt.toLocaleString("tr-TR")}` : "Son kontrol: Tarih belirtilmemiş";
        meta.appendChild(createSafeElement("span", "professional-result-freshness", checkedText));
        meta.appendChild(createSafeElement("span", "professional-result-freshness", `${Number(data.freshness && data.freshness.sourceCount) || 0} güncel kaynak`));
    }
    if (model.usedFallback) meta.appendChild(createSafeElement("span", "professional-badge is-muted", "Yerel fallback içeriği"));
    head.append(titleGroup, meta);
    host.appendChild(head);

    if (data && data.currentState === "CURRENT_EMPTY") {
        host.dataset.currentEmpty = "true";
        const empty = createSafeElement("section", "professional-result-card current-empty-card");
        empty.appendChild(createSafeElement("h3", "professional-card-title", "Güncel kaynak bulunamadı"));
        empty.appendChild(createSafeElement("p", "professional-readable-text current-empty-message", model.summary || "Bu konu için güncel ve doğrulanabilir bir kaynak şu anda bulunamadı."));
        const availability = createSafeElement("div", "professional-reliability-grid current-empty-availability");
        [["Kaynak", "0"], ["Durum", "Doğrulanmış güncel içerik yok"], ["Güvenilirlik", "Değerlendirilemedi"]].forEach(pair => {
            const stat = createSafeElement("div", "professional-reliability-stat");
            stat.append(createSafeElement("strong", "", pair[1]), createSafeElement("span", "", pair[0]));
            availability.appendChild(stat);
        });
        empty.appendChild(availability);
        const retry = createSafeElement("button", "professional-question-button current-empty-retry", "Tekrar Ara");
        retry.type = "button";
        retry.addEventListener("click", () => {
            const input = $("questionInput");
            if (input) input.value = model.query;
            researchTopic();
        });
        empty.appendChild(retry);
        host.appendChild(empty);

        if (model.limitations.length) {
            const note = createSafeElement("aside", "professional-limitations current-empty-limitations");
            note.setAttribute("role", "note");
            note.appendChild(createSafeElement("h3", "professional-card-title", "Bilgi Notları"));
            const list = createSafeElement("ul", "professional-point-list");
            model.limitations.forEach(item => list.appendChild(createSafeElement("li", "", item)));
            note.appendChild(list); host.appendChild(note);
        }

        if (model.questions.length) {
            const follow = createSafeElement("section", "professional-result-card current-empty-followups");
            follow.appendChild(createSafeElement("h3", "professional-card-title", "Takip Araştırmaları"));
            const grid = createSafeElement("div", "professional-question-grid");
            model.questions.slice(0, 3).forEach(item => {
                const button = createSafeElement("button", "professional-question-button", item.text);
                button.type = "button";
                button.dataset.followUpQuery = item.query;
                button.addEventListener("click", () => {
                    const input = $("questionInput");
                    if (input) input.value = item.query;
                    researchTopic();
                });
                grid.appendChild(button);
            });
            follow.appendChild(grid); host.appendChild(follow);
        }
        return;
    }
    delete host.dataset.currentEmpty;

    if (model.safeImage) {
        const visual = createSafeElement("figure", "professional-result-visual");
        const image = document.createElement("img");
        image.src = model.safeImage;
        image.alt = `${model.title} konusu görseli`;
        image.loading = "lazy";
        image.decoding = "async";
        image.onerror = () => visual.remove();
        visual.appendChild(image);
        host.appendChild(visual);
    }

    if (model.summary || model.introduction) {
        const summary = createSafeElement("section", "professional-result-card professional-summary");
        summary.appendChild(createSafeElement("h3", "professional-card-title", "Kısa Özet"));
        summary.appendChild(createSafeElement("p", "professional-readable-text", model.summary || model.introduction));
        host.appendChild(summary);
    }

    if (model.sections.length) {
        const sectionWrap = createSafeElement("section", "professional-result-card");
        sectionWrap.appendChild(createSafeElement("h3", "professional-card-title", "İçerik Bölümleri"));
        const grid = createSafeElement("div", "professional-section-grid");
        model.sections.forEach(section => {
            const card = createSafeElement("article", "professional-content-section");
            if (section.title) card.appendChild(createSafeElement("h4", "professional-section-title", section.title));
            if (section.text) card.appendChild(createSafeElement("p", "professional-readable-text", section.text));
            if (data && data.researchMode === "current" && (section.publishedAt || section.sourceCount)) {
                const eventMeta = createSafeElement("div", "professional-event-meta");
                eventMeta.appendChild(createSafeElement("p", "professional-fact-meta", `${currentDateLabel(section.publishedAt)} · ${Number(section.sourceRefs?.length || section.sourceCount) || 1} kaynak`));
                if (section.crossSourceSupport === true || Number(section.independentDomains) >= 2) eventMeta.appendChild(createSafeElement("span", "professional-cross-source-badge", "Birden fazla kaynaktan doğrulandı"));
                else eventMeta.appendChild(createSafeElement("span", "professional-single-source-badge", "Tek kaynak"));
                if (Array.isArray(section.contradictions) && section.contradictions.length) eventMeta.appendChild(createSafeElement("span", "professional-contradiction-badge", "Kaynaklar farklı bilgi veriyor"));
                if (section.reliability?.label) eventMeta.appendChild(createSafeElement("span", "professional-event-reliability", `Güvenilirlik: ${section.reliability.label}`));
                card.appendChild(eventMeta);
            }
            const points = Array.isArray(section.points) ? section.points.filter(Boolean).slice(0, 5) : [];
            if (points.length) {
                const list = createSafeElement("ul", "professional-point-list");
                points.forEach(point => list.appendChild(createSafeElement("li", "", point)));
                card.appendChild(list);
            }
            const eventSources = Array.isArray(section.sources) ? section.sources.filter(source => model.safeUrl(source?.url)).slice(0, 8) : [];
            if (data && data.researchMode === "current" && eventSources.length) {
                const eventKey = safeText(section.eventId || `event-${grid.children.length + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-");
                const panelId = `event-sources-${eventKey}`; const toggle = createSafeElement("button", "professional-event-source-toggle", "Kaynakları Gör");
                toggle.type = "button"; toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-controls", panelId);
                const panel = createSafeElement("div", "professional-event-source-panel"); panel.id = panelId; panel.hidden = true;
                eventSources.forEach(source => {
                    const sourceCard = createSafeElement("article", "professional-event-source-card");
                    sourceCard.appendChild(createSafeElement("h5", "professional-event-source-title", source.title || source.provider || source.domain || "Kaynak"));
                    sourceCard.appendChild(createSafeElement("p", "professional-fact-meta", [source.provider, source.domain, currentDateLabel(source.publishedAt), source.score ? `Skor: ${source.score}` : ""].filter(Boolean).join(" · ")));
                    if (source.excerpt) sourceCard.appendChild(createSafeElement("p", "professional-readable-text", source.excerpt));
                    const link = createSafeElement("a", "professional-source-link", "Kaynağı aç"); link.href = model.safeUrl(source.url); link.target = "_blank"; link.rel = "noopener noreferrer"; sourceCard.appendChild(link); panel.appendChild(sourceCard);
                });
                const eventClaims = Array.isArray(section.claims) ? section.claims.filter(claim => claim?.text && Array.isArray(claim.sourceRefs)).slice(0, 8) : [];
                if (eventClaims.length) {
                    const claimsWrap = createSafeElement("section", "professional-claim-source-list"); claimsWrap.appendChild(createSafeElement("h5", "professional-event-source-title", "Doğrulanmış İddialar ve Kaynakları"));
                    eventClaims.forEach((claim, claimIndex) => {
                        const claimCard = createSafeElement("article", "professional-claim-source-card"); claimCard.appendChild(createSafeElement("p", "professional-readable-text", claim.text));
                        const support = claim.contradicted ? "Kaynaklar çelişiyor" : Number(claim.independentDomains) >= 2 ? `${claim.independentDomains} bağımsız kaynak` : Number(claim.sourceCount) === 1 && Number(claim.authority) >= 95 ? "1 resmi kaynak" : `${Number(claim.sourceCount) || 0} kaynak`;
                        claimCard.appendChild(createSafeElement("span", claim.contradicted ? "professional-contradiction-badge" : "professional-claim-support-badge", support));
                        const claimPanelId = `${panelId}-claim-${claimIndex + 1}`; const claimToggle = createSafeElement("button", "professional-claim-source-toggle", "İddia Kaynaklarını Gör"); claimToggle.type = "button"; claimToggle.setAttribute("aria-expanded", "false"); claimToggle.setAttribute("aria-controls", claimPanelId);
                        const claimSources = createSafeElement("div", "professional-claim-sources"); claimSources.id = claimPanelId; claimSources.hidden = true;
                        (claim.sources || []).filter(source => model.safeUrl(source?.url)).forEach(source => { const row = createSafeElement("div", "professional-claim-source-row"); row.appendChild(createSafeElement("span", "", [source.provider, source.domain, currentDateLabel(source.publishedAt)].filter(Boolean).join(" · "))); const link = createSafeElement("a", "professional-source-link", "Kaynağı aç"); link.href = model.safeUrl(source.url); link.target = "_blank"; link.rel = "noopener noreferrer"; row.appendChild(link); claimSources.appendChild(row); });
                        claimToggle.addEventListener("click", () => { const expanded = claimToggle.getAttribute("aria-expanded") === "true"; claimToggle.setAttribute("aria-expanded", String(!expanded)); claimToggle.textContent = expanded ? "İddia Kaynaklarını Gör" : "İddia Kaynaklarını Gizle"; claimSources.hidden = expanded; }); claimCard.append(claimToggle, claimSources); claimsWrap.appendChild(claimCard);
                    }); panel.appendChild(claimsWrap);
                }
                if (Array.isArray(section.contradictions) && section.contradictions.length) {
                    const conflictWrap = createSafeElement("aside", "professional-contradiction-panel"); conflictWrap.setAttribute("role", "note"); conflictWrap.appendChild(createSafeElement("h5", "professional-event-source-title", "Kaynaklar Arasındaki Fark")); conflictWrap.appendChild(createSafeElement("p", "professional-readable-text", "Kaynaklar bu ayrıntıda farklı bilgi veriyor; sistem tek bir varyantı doğru kabul etmedi."));
                    section.contradictions.forEach(conflict => (conflict.variants || []).forEach(variant => conflictWrap.appendChild(createSafeElement("p", "professional-contradiction-variant", `${variant.text} (${variant.sourceRefs?.length || 0} kaynak)`)))); panel.appendChild(conflictWrap);
                }
                toggle.addEventListener("click", () => { const expanded = toggle.getAttribute("aria-expanded") === "true"; toggle.setAttribute("aria-expanded", String(!expanded)); toggle.textContent = expanded ? "Kaynakları Gör" : "Kaynakları Gizle"; panel.hidden = expanded; });
                card.append(toggle, panel);
            }
            grid.appendChild(card);
        });
        sectionWrap.appendChild(grid);
        host.appendChild(sectionWrap);
    }

    if (model.concepts.length) {
        const card = createSafeElement("section", "professional-result-card");
        card.appendChild(createSafeElement("h3", "professional-card-title", "Anahtar Kavramlar"));
        const grid = createSafeElement("div", "professional-concept-grid");
        model.concepts.forEach(item => {
            const concept = createSafeElement("article", "professional-concept-card");
            concept.appendChild(createSafeElement("h4", "professional-concept-term", item.term));
            if (item.definition) concept.appendChild(createSafeElement("p", "professional-readable-text", item.definition));
            grid.appendChild(concept);
        });
        card.appendChild(grid);
        host.appendChild(card);
    }

    if (model.facts.length) {
        const card = createSafeElement("section", "professional-result-card");
        card.appendChild(createSafeElement("h3", "professional-card-title", data && data.currentState === "CURRENT_VERIFIED" ? "Doğrulanmış Bilgiler" : "Önemli Bilgiler"));
        const list = createSafeElement("div", "professional-fact-list");
        model.facts.forEach(fact => {
            const item = createSafeElement("article", "professional-fact-card");
            item.appendChild(createSafeElement("p", "professional-readable-text", fact.text));
            const confidence = fact.reliability || fact.confidence;
            const label = /^(Yüksek|Orta|Sınırlı)$/i.test(String(confidence || "")) ? confidence : model.confidenceLabel(confidence);
            const metaLine = createSafeElement("p", "professional-fact-meta", `${label} · ${Number(fact.sourceCount) || 0} kaynak`);
            item.appendChild(metaLine);
            list.appendChild(item);
        });
        card.appendChild(list);
        host.appendChild(card);
    }

    if (model.timeline.length) {
        const card = createSafeElement("section", "professional-result-card");
        card.appendChild(createSafeElement("h3", "professional-card-title", "Zaman Çizelgesi"));
        const list = createSafeElement("ol", "professional-point-list professional-timeline-list");
        model.timeline.forEach(item => {
            const date = item.date && !Number.isNaN(Date.parse(item.date)) ? new Date(item.date).toLocaleDateString("tr-TR") : "Tarih belirtilmemiş";
            list.appendChild(createSafeElement("li", "", `${date} — ${item.title || item.text || "Gelişme"}`));
        });
        card.appendChild(list); host.appendChild(card);
    }

    if (model.comparison && Array.isArray(model.comparison.entities) && model.comparison.entities.length === 2) {
        const card = createSafeElement("section", "professional-result-card");
        card.appendChild(createSafeElement("h3", "professional-card-title", `${model.comparison.entities[0]} / ${model.comparison.entities[1]} Karşılaştırması`));
        const list = createSafeElement("div", "professional-fact-list");
        (model.comparison.features || []).slice(0, 8).forEach(item => list.appendChild(createSafeElement("p", "professional-fact-card", item.feature || "")));
        card.appendChild(list); host.appendChild(card);
    }

    if (model.interestingFacts.length) {
        const card = createSafeElement("section", "professional-result-card");
        card.appendChild(createSafeElement("h3", "professional-card-title", "İlginç Bilgiler"));
        const list = createSafeElement("ul", "professional-point-list professional-interesting-list");
        model.interestingFacts.forEach(fact => list.appendChild(createSafeElement("li", "", fact)));
        card.appendChild(list);
        host.appendChild(card);
    }

    if (model.reliability) {
        const card = createSafeElement("section", "professional-result-card professional-reliability");
        card.appendChild(createSafeElement("h3", "professional-card-title", "Kaynak Güvenilirliği"));
        card.appendChild(createSafeElement("p", "professional-readable-text", "Bu puan, kaynak kalitesi ve çeşitliliğine dayalı heuristik bir göstergedir; kesin doğruluk oranı değildir."));
        const stats = createSafeElement("div", "professional-reliability-grid");
        [["Genel puan", model.score === null ? "—" : model.score], ["Seviye", model.confidenceLabel(model.reliability.level)], ["Kaynak", Number(model.reliability.sourceCount) || 0], ["Bağımsız domain", Number(model.reliability.independentDomainCount) || 0], ["Yüksek kalite", Number(model.reliability.highQualitySourceCount) || 0]].forEach(pair => {
            const stat = createSafeElement("div", "professional-reliability-stat");
            stat.append(createSafeElement("strong", "", pair[1]), createSafeElement("span", "", pair[0]));
            stats.appendChild(stat);
        });
        card.appendChild(stats);
        host.appendChild(card);
    }

    const sourceItems = model.articles.length
        ? model.articles
        : model.sources.map(source => ({ title: source, url: source }));
    if (sourceItems.length) {
        const card = createSafeElement("section", "professional-result-card");
        card.appendChild(createSafeElement("h3", "professional-card-title", "Kaynaklar"));
        const grid = createSafeElement("div", "professional-source-grid");
        const seenUrls = new Set();
        const seenTitles = new Set();
        sourceItems.forEach(article => {
            const titleText = String(article.title || article.source || "Kaynak").trim() || "Kaynak";
            const url = model.safeUrl(article.url || article.link);
            const titleKey = titleText.toLowerCase();
            const domainKey = (() => { try { return url ? new URL(url).hostname.replace(/^www\./, "").toLowerCase() : ""; } catch (_) { return ""; } })();
            if ((url && seenUrls.has(url)) || (domainKey && seenTitles.has(`${domainKey}|${titleKey}`))) return;
            if (url) seenUrls.add(url);
            if (domainKey) seenTitles.add(`${domainKey}|${titleKey}`);
            const source = createSafeElement("article", "professional-source-card");
            source.appendChild(createSafeElement("h4", "professional-source-title", titleText));
            const domain = (() => { try { return url ? new URL(url).hostname.replace(/^www\./, "") : (article.source || "Kaynak"); } catch (_) { return article.source || "Kaynak"; } })();
            source.appendChild(createSafeElement("p", "professional-source-domain", domain));
            if (data && data.researchMode === "current") {
                const published = currentDateLabel(article.publishedAt);
                source.appendChild(createSafeElement("p", "professional-source-date", published));
            }
            if (article.text || article.summary) source.appendChild(createSafeElement("p", "professional-readable-text", String(article.text || article.summary).slice(0, 280)));
            if (article.reliabilityLevel) {
                const score = model.finiteScore(article.reliabilityScore);
                source.appendChild(createSafeElement("p", "professional-fact-meta", `${model.confidenceLabel(article.reliabilityLevel)} · puan ${score === null ? "—" : score}`));
            }
            if (url) {
                const link = createSafeElement("a", "professional-source-link", "Kaynağı aç →");
                link.href = url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                source.appendChild(link);
            }
            grid.appendChild(source);
        });
        card.appendChild(grid);
        host.appendChild(card);
    }

    if (model.questions.length) {
        const card = createSafeElement("section", "professional-result-card");
        card.appendChild(createSafeElement("h3", "professional-card-title", "Takip Soruları"));
        const grid = createSafeElement("div", "professional-question-grid");
        model.questions.forEach(question => {
            const button = createSafeElement("button", "professional-question-button", question.text);
            button.type = "button";
            button.dataset.followUpQuery = question.query;
            button.addEventListener("click", () => {
                const input = $("questionInput");
                if (input) input.value = question.query;
                researchTopic();
            });
            grid.appendChild(button);
        });
        card.appendChild(grid);
        host.appendChild(card);
    }

    if (model.limitations.length) {
        const note = createSafeElement("aside", "professional-limitations", "");
        note.setAttribute("role", "note");
        note.appendChild(createSafeElement("h3", "professional-card-title", "Bilgi Notları"));
        const list = createSafeElement("ul", "professional-point-list");
        model.limitations.forEach(item => list.appendChild(createSafeElement("li", "", item)));
        note.appendChild(list);
        host.appendChild(note);
    }
}

typeWriter($("summaryText"), summary);

const heroSummary = $("heroSummary");

if (heroSummary) {

    heroSummary.textContent = summary;

}

const medicalNotice = $("medicalNotice");
if (medicalNotice) {
    medicalNotice.textContent = data.medicalNotice || "";
    medicalNotice.hidden = !data.medicalNotice;
}

$("heroCategory").textContent =
    analysis.subject ||
    brain.category ||
    "Genel";

$("heroSources").textContent =
    getSourceArticles(data).length;

$("heroImages").textContent =
    getUniqueImages(data.images).length;

$("heroFacts").textContent =
    brain.facts?.length || 0;

const teacherSimple = $("teacherSimple");

if (teacherSimple) {

    typeWriter(
        teacherSimple,
        ai.lesson?.simple ||
        (currentVerified ? "" :
        createSimpleLesson(
            $("topicTitle").textContent
        ))
    );

}
const teacherDetailed = $("teacherDetailed");

if (teacherDetailed) {

    teacherDetailed.textContent =
        ai.lesson?.detailed || (currentVerified ? "" :
        createDetailedLesson(
            $("topicTitle").textContent,
            summary
        ));

}

$("teacherAnalogy").textContent =
    ai.lesson?.analogy || (currentVerified ? "" :
    createAnalogy(
        $("topicTitle").textContent
    ));
if (currentVerified && $("teacherAnalogy")) {
    $("teacherAnalogy").hidden = true;
    const heading = $("teacherAnalogy").previousElementSibling;
    if (heading) heading.hidden = true;
}

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

    } else if (!currentVerified) {

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

renderFlashcards(
    data.brain?.flashcards ||
    data.ai?.flashcards ||
    data.flashcards ||
    []
);

const interestingBox = $("interestingText");

if(interestingBox){

   const interestingText = $("interestingText");

if (interestingText) {

    interestingText.textContent = currentEmpty
        ? "Doğrulanmış güncel bilgi bulunamadı."
        : safeText(ai.interesting) || safeText(brain.interesting) || safeText(data.interesting) || (currentVerified ? "" : getInterestingFact($("topicTitle").textContent));
   }
}

var interestingFacts={

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

const related = currentEmpty ? [] :
normalizeList(
    ai.relatedTopics ||
    data.related ||
    data.relatedTopics ||
    analysis.relatedTopics ||
    brain.relatedTopics ||
    []
);

renderKnowledgeGraph({
    topic: data.query || data.title || ai.title || "",
    related,
    keyConcepts: data.structuredContent?.keyConcepts || ai.keyConcepts || [],
    connections: livingMemoryData?.connections || [],
    history: currentEmpty ? [] : livingMemoryData?.history || []
});

renderRelated(related);

const followUps =
(window.ResultRenderers?.followUpItems || (value => value))(
data.followUpQuestions ||
data.followUps ||
data.followupQuestions ||
data.structuredContent?.followUpQuestions ||
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

initializeHorizontalRails();

updateSaveButton();

}

/* =========================================================
   HORIZONTAL RESULT RAILS
========================================================= */

const horizontalRailRegistry = new Set();
let horizontalRailResizeBound = false;

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function railHasRealItems(container) {
    return Array.from(container.children).some(child => {
        if (child.classList.contains("living-memory-empty") || child.classList.contains("living-memory-skeleton") || child.classList.contains("living-memory-error")) return false;
        return !child.classList.contains("fact") || child.children.length > 1;
    });
}

function updateHorizontalRail(rail) {
    const { container, previous, next, count, hint } = rail;
    const max = Math.max(0, container.scrollWidth - container.clientWidth);
    const atStart = container.scrollLeft <= 2;
    const atEnd = container.scrollLeft >= max - 2;
    const singleItem = container.children.length <= 1;
    previous.disabled = singleItem || atStart;
    next.disabled = singleItem || atEnd;
    count.textContent = `${container.children.length} öğe`;
    const scrollable = !singleItem && max > 2;
    rail.controls.classList.toggle("is-scrollable", scrollable);
    hint.hidden = !scrollable;
    hint.setAttribute("aria-hidden", String(!scrollable));
}

function scrollHorizontalRail(rail, direction) {
    const first = rail.container.firstElementChild;
    const amount = Math.max(rail.container.clientWidth * 0.72, first ? first.getBoundingClientRect().width + 12 : 240);
    rail.container.scrollBy({
        left: direction * amount,
        behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
}

function createHorizontalRail(container) {
    if (!container || container.dataset.horizontalRail === "true") {
        return container && container._horizontalRail;
    }
    if (!railHasRealItems(container)) return null;

    const parent = container.parentElement;
    if (!parent) return null;

    const section = container.closest(".section, .professional-result-card");
    const title = section?.querySelector(".section-title, .professional-card-title")?.textContent?.trim() || "İçerik";
    const controls = document.createElement("div");
    controls.className = "yd-rail-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", `${title} kaydırma kontrolleri`);

    const count = document.createElement("span");
    count.className = "yd-rail-count";
    const hint = document.createElement("span");
    hint.className = "yd-rail-hint";
    hint.textContent = "Yana kaydır";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "yd-rail-arrow";
    previous.setAttribute("aria-label", `${title} önceki kart`);
    previous.textContent = "←";
    const next = document.createElement("button");
    next.type = "button";
    next.className = "yd-rail-arrow";
    next.setAttribute("aria-label", `${title} sonraki kart`);
    next.textContent = "→";

    controls.append(count, hint, previous, next);
    parent.insertBefore(controls, container);
    container.classList.add("yd-horizontal-rail");
    container.dataset.horizontalRail = "true";
    container.tabIndex = 0;
    container.setAttribute("aria-label", `${title} yatay kart listesi`);

    const rail = { container, controls, count, hint, previous, next };
    container._horizontalRail = rail;
    horizontalRailRegistry.add(container);
    previous.addEventListener("click", () => scrollHorizontalRail(rail, -1));
    next.addEventListener("click", () => scrollHorizontalRail(rail, 1));
    container.addEventListener("scroll", () => updateHorizontalRail(rail), { passive: true });
    container.addEventListener("keydown", event => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (event.key === "Home") container.scrollTo({ left: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
            else if (event.key === "End") container.scrollTo({ left: container.scrollWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
            else scrollHorizontalRail(rail, event.key === "ArrowRight" ? 1 : -1);
        }
    });
    updateHorizontalRail(rail);
    requestAnimationFrame(() => {
        if (container.isConnected) updateHorizontalRail(rail);
    });
    return rail;
}

function initializeHorizontalRails() {
    const selectors = [
        ".professional-concept-grid",
        ".professional-fact-list",
        ".professional-source-grid",
        ".professional-question-grid",
        ".professional-interesting-list",
        "#factsContainer",
        "#imagesContainer",
        "#flashcardsContainer",
        "#memoryContainer",
        "#knowledgeMap",
        "#followContainer",
        "#relatedContainer",
        "#sourcesContainer",
        ".living-memory-rail"
    ];
    horizontalRailRegistry.forEach(container => {
        if (!container.isConnected) horizontalRailRegistry.delete(container);
    });
    selectors.forEach(selector => {
        const container = document.querySelector(selector);
        if (!container) return;
        const rail = createHorizontalRail(container);
        if (rail) {
            if (container.dataset.horizontalRail === "true") updateHorizontalRail(rail);
        }
    });
    if (!horizontalRailResizeBound) {
        horizontalRailResizeBound = true;
        window.addEventListener("resize", () => {
            horizontalRailRegistry.forEach(container => {
                if (!container.isConnected) {
                    horizontalRailRegistry.delete(container);
                } else if (container._horizontalRail) {
                    updateHorizontalRail(container._horizontalRail);
                }
            });
        }, { passive: true });
    }
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

if(typeof item === "string") return window.ResultRenderers && window.ResultRenderers.safeUrl
? window.ResultRenderers.safeUrl(item)
: "";

const candidate = (
item.thumbnail ||
item.thumb ||
item.image ||
item.url ||
item.imageUrl ||
item.src ||
item.source ||
""
);
return window.ResultRenderers && window.ResultRenderers.safeUrl
? window.ResultRenderers.safeUrl(candidate)
: "";

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
// Wikimedia lookup belongs to the server-side research pipeline. Browser
// fallbacks must never call the Commons API cross-origin.
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

if (data?.currentState === "CURRENT_VERIFIED") {
    (Array.isArray(facts) ? facts : []).slice(0, 8).forEach(fact => {
        const text = safeText(typeof fact === "string" ? fact : fact?.text);
        if (!text) return;
        const element = document.createElement("article"); element.className = "fact current-fact";
        const label = document.createElement("div"); label.className = "fact-type"; label.textContent = safeText(fact?.subcategory || "DOĞRULANMIŞ GELİŞME").replace(/_/g, " ");
        const paragraph = document.createElement("p"); paragraph.textContent = text.slice(0, 320);
        const meta = document.createElement("small"); meta.className = "professional-fact-meta"; meta.textContent = `${safeText(fact?.reliability || "Sınırlı")} · ${Number(fact?.sourceCount) || 0} kaynak`;
        element.append(label, paragraph, meta); container.appendChild(element);
    });
    return;
}

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

function renderFlashcards(cards) {
    const container = $("flashcardsContainer");
    if (!container) return;
    container.innerHTML = "";
    const items = Array.isArray(cards) ? cards.filter(card =>
        card && (card.question || card.front) && (card.answer || card.back)
    ) : [];
    if (!items.length) {
        container.innerHTML =
            '<div class="fact" style="grid-column:1/-1">' +
            '<h4>Hafıza kartı hazır değil</h4>' +
            '<p>Bu araştırma için yeterli tekrar bilgisi bulunamadı.</p>' +
            '</div>';
        return;
    }
    items.slice(0, 8).forEach(card => {
        const wrapper = document.createElement("article");
        wrapper.className = "flashcard";
        wrapper.tabIndex = 0;
        wrapper.setAttribute("role", "button");
        const question = document.createElement("div");
        question.className = "flashcard-question";
        question.textContent = card.question || card.front;
        const answer = document.createElement("div");
        answer.className = "flashcard-answer";
        answer.textContent = card.answer || card.back;
        const toggle = () => wrapper.classList.toggle("is-flipped");
        wrapper.addEventListener("click", toggle);
        wrapper.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle();
            }
        });
        wrapper.append(question, answer);
        container.appendChild(wrapper);
    });
}

/* =========================================================
   IMAGES
========================================================= */

function openImageDetail(item, trigger){
let dialog = $("imageDetailDialog");
if(!dialog){dialog=document.createElement("dialog");dialog.id="imageDetailDialog";dialog.className="image-detail-dialog";dialog.setAttribute("aria-labelledby","imageDetailTitle");const shell=document.createElement("div");shell.className="image-detail-shell";const close=document.createElement("button");close.type="button";close.className="image-detail-close";close.textContent="Kapat";close.setAttribute("aria-label","Görsel ayrıntısını kapat");const image=document.createElement("img");image.id="imageDetailImage";image.alt="";const copy=document.createElement("div");copy.className="image-detail-copy";const title=document.createElement("h3");title.id="imageDetailTitle";const description=document.createElement("p");description.id="imageDetailDescription";const meta=document.createElement("p");meta.id="imageDetailMeta";const source=document.createElement("a");source.id="imageDetailSource";source.target="_blank";source.rel="noopener noreferrer";source.textContent="Kaynak sayfasını aç";copy.append(title,description,meta,source);shell.append(close,image,copy);dialog.appendChild(shell);document.body.appendChild(dialog);close.addEventListener("click",()=>dialog.close());dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});dialog.addEventListener("close",()=>trigger?.focus());}
const safeSource=window.ResultRenderers?.safeUrl(item.sourceUrl||"")||"";$("imageDetailImage").src=item.url;$("imageDetailImage").alt=item.title||"Araştırma görseli";$("imageDetailTitle").textContent=item.title||"Görsel ayrıntısı";$("imageDetailDescription").textContent=item.description||"Bu görsel için ek açıklama belirtilmemiş.";$("imageDetailMeta").textContent=`${item.sourceName||"Kaynak belirtilmemiş"} · Lisans: ${item.license||"Belirtilmemiş"} · ${item.attribution||"Attribution belirtilmemiş"}`;const link=$("imageDetailSource");link.href=safeSource||"#";link.hidden=!safeSource;dialog.showModal();
}

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
        ),
    description: typeof item === "string" ? "" : safeText(item.description),
    sourceName: typeof item === "string" ? "" : safeText(item.sourceName || item.source),
    sourceUrl: typeof item === "string" ? "" : (window.ResultRenderers?.safeUrl(item.sourceUrl || "") || ""),
    license: typeof item === "string" ? "Belirtilmemiş" : safeText(item.license || "Belirtilmemiş"),
    attribution: typeof item === "string" ? "" : safeText(item.attribution),
    visualType: typeof item === "string" ? "UNKNOWN" : safeText(item.visualType || "UNKNOWN"),
    relevanceScore: typeof item === "string" ? 0 : Number(item.relevanceScore || item.imageRelevanceScore || 0),
    isHero: typeof item === "string" ? false : item.isHero === true
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

    if (blocked.some(word => t.includes(word))) return false;

    const topic = safeText(currentAnalysis?.topic || currentResearch?.title || "")
        .toLocaleLowerCase("tr-TR");
    if (topic.includes("yapay zeka") || topic.includes("yapay zekâ")) {
        const relevant = ["yapay", "zeka", "makine", "öğrenme", "sinir", "robot", "algoritma", "veri", "bilgisayar"];
        if (!relevant.some(word => t.includes(word))) return false;
    }

    if (/(insülin|diyabet|hipertansiyon|metabolizma|sağlık|tıp|glukoz|vitamin)/i.test(topic)) {
        const relevant = ["insulin", "insülin", "glucose", "glukoz", "metabolism", "metabolic", "pancreas", "diabetes", "hormone", "medical", "medicine", "blood"];
        if (!relevant.some(word => t.includes(word))) return false;
    }

    return true;

})
.filter((item, index, list) =>
    list.findIndex(other =>
        other.url === item.url ||
        (item.title && other.title === item.title)
    ) === index
)
.slice(0,6)
: [];

const heroImages = $("heroImages");
if (currentResearch) {
    currentResearch.images = normalized;
    renderStats(currentResearch);
}
if (heroImages) heroImages.textContent = String(normalized.length);

if(!normalized.length){
loadWikimediaGallery();

return;

}

normalized.forEach(item=>{

const card =
document.createElement("article");

card.className = "image-card" + (item.isHero ? " image-card-hero" : "");

const img =
document.createElement("img");

img.alt =
item.title || "Yaşayan Defter görseli";

img.loading = item.isHero ? "eager" : "lazy";
if(item.isHero) img.fetchPriority = "high";

img.src = item.url;

img.onerror = function(){img.hidden=true;card.classList.add("image-card-broken");card.setAttribute("aria-disabled","true");};

card.appendChild(img);

const caption =
document.createElement("div");

caption.className = "image-caption";
const title=document.createElement("strong");title.textContent=item.title||"Araştırma görseli";const context=document.createElement("span");context.textContent=item.description||"Görsel kaynağındaki açıklama belirtilmemiş.";const meta=document.createElement("small");meta.textContent=`${item.sourceName||"Kaynak belirtilmemiş"} · ${item.visualType.replace(/_/g," ")} · Lisans: ${item.license||"Belirtilmemiş"}`;caption.append(title,context,meta);
const actions=document.createElement("span");actions.className="image-card-actions";const detail=document.createElement("button");detail.type="button";detail.textContent="Ayrıntıyı gör";detail.setAttribute("aria-label",`${item.title||"Görsel"} ayrıntısını aç`);actions.appendChild(detail);if(item.sourceUrl){const source=document.createElement("a");source.href=item.sourceUrl;source.target="_blank";source.rel="noopener noreferrer";source.textContent="Kaynak";actions.appendChild(source);}caption.appendChild(actions);

card.appendChild(caption);

detail.addEventListener("click",()=>{if(!card.classList.contains("image-card-broken"))openImageDetail(item,detail);});

container.appendChild(card);

});

}

function loadWikimediaGallery(){

const container = $("imagesContainer");

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

function quizText(value) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    const clean = String(value).replace(/\s+/g, " ").trim();
    return /\[object Object\]|undefined|null|Error/i.test(clean) ? "" : clean;
}

function ensureProQuizSettings() {
    const question = $("quizQuestion");
    if (!question || $("quizProSettings")) return;
    const settings = document.createElement("div");
    settings.id = "quizProSettings";
    settings.className = "quiz-pro-settings";
    settings.setAttribute("role", "group");
    settings.setAttribute("aria-label", "Quiz ayarları");
    [["quizProDifficulty", "Zorluk", [["easy", "Kolay"], ["medium", "Orta"], ["hard", "Zor"]]], ["quizProCount", "Soru sayısı", [["5", "5 soru"], ["10", "10 soru"]]], ["quizProType", "Soru türü", [["multiple-choice", "Çoktan seçmeli"], ["true-false", "Doğru / Yanlış"]]]].forEach(([id, label, values]) => {
        const wrap = document.createElement("label");
        wrap.textContent = `${label}: `;
        const select = document.createElement("select");
        select.id = id;
        select.setAttribute("aria-label", label);
        values.forEach(([value, name]) => { const option = document.createElement("option"); option.value = value; option.textContent = name; select.appendChild(option); });
        wrap.appendChild(select);
        settings.appendChild(wrap);
    });
    const start = document.createElement("button");
    start.type = "button";
    start.id = "quizProStart";
    start.className = "quiz-pro-button";
    start.textContent = "Quiz'i Başlat";
    start.addEventListener("click", async () => {
        if (!currentResearch) return;
        start.disabled = true;
        try {
            const response = await fetch(API + "/api/quiz/start", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ research: currentResearch, count: Number($("quizProCount")?.value || 5), difficulty: $("quizProDifficulty")?.value || "medium", type: $("quizProType")?.value || "multiple-choice", studentId: activeStudentId() }) });
            const payload = await response.json();
            if (!response.ok || !payload.attempt) throw new Error("Quiz oluşturulamadı.");
            if (!payload.attempt.questions?.length) throw new Error("Bu konu için güvenli soru bulunamadı.");
            renderProQuiz(payload.attempt, currentResearch, true);
        } catch (error) {
            const result = $("quizResult");
            if (result) { result.className = "quiz-result bad"; result.textContent = "Bu konu için güvenli biçimde hazırlanabilen soru sayısı sınırlıydı."; }
        } finally { start.disabled = false; }
    });
    settings.appendChild(start);
    question.parentNode.insertBefore(settings, question);
}

function proQuizNormalize(value) {
    return quizText(value).toLocaleLowerCase("tr-TR").replace(/[\s\p{P}\p{S}]+/gu, " ");
}

function renderProQuiz(quiz, data, restart = false) {
    ensureProQuizSettings();
    activeProQuiz = quiz;
    if (restart) {
        activeProQuizIndex = 0;
        activeProQuizAnswers = [];
    }
    activeProQuizChecked = false;
    renderProQuizQuestion();
}

function renderProQuizQuestion() {
    const question = $("quizQuestion");
    const options = $("quizOptions");
    const result = $("quizResult");
    if (!question || !options || !result || !activeProQuiz?.questions?.length) return;
    if (!activeProQuiz.attemptId) {
        question.textContent = "Quiz ayarlarını seçip başlatabilirsin.";
        options.replaceChildren();
        result.replaceChildren();
        result.textContent = "Cevaplar server tarafından doğrulanır.";
        return;
    }
    const item = activeProQuiz.questions[activeProQuizIndex];
    activeProQuizChecked = false;
    question.textContent = `Soru ${activeProQuizIndex + 1} / ${activeProQuiz.questions.length}: ${quizText(item.prompt)}`;
    question.setAttribute("tabindex", "-1");
    options.replaceChildren();
    result.replaceChildren();
    result.className = "quiz-result";
    const progress = document.createElement("div");
    progress.className = "quiz-pro-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0"); progress.setAttribute("aria-valuemax", activeProQuiz.questions.length); progress.setAttribute("aria-valuenow", activeProQuizIndex + 1);
    const bar = document.createElement("span"); bar.style.width = `${((activeProQuizIndex + 1) / activeProQuiz.questions.length) * 100}%`; progress.appendChild(bar); options.appendChild(progress);
    const group = document.createElement("div"); group.className = "quiz-pro-options"; group.setAttribute("role", "group"); group.setAttribute("aria-label", "Cevap seçenekleri");
    (item.options || []).forEach(option => {
        const button = document.createElement("button"); button.type = "button"; button.className = "quiz-option"; button.textContent = quizText(option); button.addEventListener("click", () => checkProQuizAnswer(button.textContent, button, item)); group.appendChild(button);
    });
    options.appendChild(group);
    const skip = document.createElement("button"); skip.type = "button"; skip.className = "quiz-pro-skip"; skip.textContent = "Atla"; skip.addEventListener("click", () => checkProQuizAnswer("", null, item)); options.appendChild(skip);
    question.focus({ preventScroll: true });
}

async function checkProQuizAnswer(answer, clicked, item) {
    if (activeProQuizChecked) return;
    activeProQuizChecked = true;
    document.querySelectorAll("#quizOptions .quiz-option, #quizOptions .quiz-pro-skip").forEach(button => { button.disabled = true; });
    let response;
    try {
        const request = await fetch(API + "/api/quiz/answer", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ attemptId: activeProQuiz.attemptId, questionId: item.id, answer: quizText(answer), skipped: !quizText(answer), studentId: activeStudentId() }) });
        response = await request.json();
        if (!request.ok || !response.result) throw new Error("Cevap doğrulanamadı.");
    } catch (_) {
        activeProQuizChecked = false;
        document.querySelectorAll("#quizOptions .quiz-option, #quizOptions .quiz-pro-skip").forEach(button => { button.disabled = false; });
        const error = $("quizResult");
        if (error) { error.className = "quiz-result bad"; error.textContent = "Cevap şu anda doğrulanamadı. Lütfen tekrar dene."; }
        return;
    }
    const serverResult = response.result;
    const correct = Boolean(serverResult.correct);
    activeProQuizAnswers[activeProQuizIndex] = { ...serverResult, question: item };
    document.querySelectorAll("#quizOptions .quiz-option").forEach(button => {
        button.disabled = true;
    });
    if (clicked) clicked.classList.add(correct ? "correct" : "wrong");
    const result = $("quizResult");
    result.className = `quiz-result ${correct ? "good" : "bad"}`;
    result.setAttribute("aria-live", "polite");
    result.textContent = `${correct ? "Doğru." : (quizText(answer) ? "Bu cevap doğru değil." : "Soru atlandı.")} ${quizText(serverResult.explanation)}`;
    const next = document.createElement("button"); next.type = "button"; next.className = "quiz-pro-button"; next.textContent = activeProQuizIndex + 1 < activeProQuiz.questions.length ? "Sonraki soru" : "Sonuçları gör"; next.addEventListener("click", () => { if (activeProQuizIndex + 1 < activeProQuiz.questions.length) { activeProQuizIndex += 1; renderProQuizQuestion(); } else completeProQuiz(); }); result.appendChild(next);
}

async function completeProQuiz() {
    let payload;
    try {
        const response = await fetch(API + "/api/quiz/complete", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ attemptId: activeProQuiz?.attemptId, studentId: activeStudentId() }) });
        payload = await response.json();
        if (!response.ok || !payload.summary) throw new Error("Quiz tamamlanamadı.");
    } catch (_) {
        const error = $("quizResult");
        if (error) { error.className = "quiz-result bad"; error.textContent = "Quiz sonucu şu anda doğrulanamadı. Lütfen tekrar dene."; }
        return;
    }
    const summary = payload.summary;
    const wrong = Number(summary.incorrect) || 0;
    const skipped = Number(summary.skipped) || 0;
    const question = $("quizQuestion"); const options = $("quizOptions"); const result = $("quizResult");
    question.textContent = "Quiz sonucu"; options.replaceChildren(); result.replaceChildren(); result.className = "quiz-result good";
    const summaryText = document.createElement("p"); summaryText.textContent = `${summary.correct} doğru · ${wrong} yanlış · ${skipped} atlandı · Başarı: %${summary.percentage}`; result.appendChild(summaryText);
    if (Array.isArray(summary.weakConcepts) && summary.weakConcepts.length) { const heading = document.createElement("strong"); heading.textContent = "Tekrar önerileri"; result.appendChild(heading); const list = document.createElement("ul"); summary.weakConcepts.slice(0, 8).forEach(concept => { const li = document.createElement("li"); li.textContent = `${concept}: Bu noktayı tekrar gözden geçirebilirsin.`; list.appendChild(li); }); result.appendChild(list); }
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "quiz-pro-button"; retry.textContent = "Yanlışları yeniden çöz"; retry.disabled = !wrong && !skipped; retry.addEventListener("click", async () => { const response = await fetch(API + "/api/quiz/start", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ research: currentResearch, count: activeProQuiz.questions.length, difficulty: activeProQuiz.difficulty, type: activeProQuiz.type, retryOf: activeProQuiz.attemptId, studentId: activeStudentId() }) }); const next = await response.json(); if (response.ok && next.attempt?.questions?.length) { activeProQuiz = next.attempt; activeProQuizIndex = 0; activeProQuizAnswers = []; renderProQuizQuestion(); } }); result.appendChild(retry);
    window.dispatchEvent(new CustomEvent("learning:updated"));
    completeStep("quiz");
}

function renderQuiz(quiz,data){

if (data?.quizPro?.questions?.length) {
    renderProQuiz(data.quizPro, data);
    return;
}

const question = $("quizQuestion");
const options = $("quizOptions");
const result = $("quizResult");

options.innerHTML = "";
result.textContent = "";
result.className = "quiz-result";

quizAnswered = false;

if (data?.currentState === "CURRENT_EMPTY") {
    quiz = null;
    question.textContent = "Quiz oluşturmak için yeterli doğrulanmış bilgi bulunamadı.";
    return;
} else if (data?.currentState === "CURRENT_VERIFIED" && (!quiz || !quiz.question || !window.ResultRenderers?.quizOptions(quiz.options).length)) {
    quiz = null;
} else if (data?.researchUnavailable) {
    quiz = null;
} else if(
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

if (currentResearch) currentResearch.quiz = quiz;

question.textContent = quiz.question;

const correct =
quiz.correctAnswer ||
quiz.correct ||
quiz.answer ||
"";

const normalizedOptions = window.ResultRenderers?.quizOptions(quiz.options) || [];
normalizedOptions.forEach(option=>{

const button =
document.createElement("button");

button.className = "quiz-option";
button.textContent = option;

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

    const normalized = window.ResultRenderers?.followUpItems
        ? window.ResultRenderers.followUpItems(items)
        : items.map(item => typeof item === "string" ? { text: item, query: item } : { text: item?.text || item?.question || item?.title || "", query: item?.query || item?.text || item?.question || item?.title || "" }).filter(item => item.text && item.query);

    normalized.forEach(item=>{

        const button = document.createElement("button");

        button.className = "follow-btn";

        button.textContent = item.text;
        button.dataset.followUpQuery = item.query;

        button.onclick = () => {

            const input = $("questionInput");

            if(input){

                input.value = item.query;

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

const seen = new Set();
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
.filter(item=>{
    if(!item.title) return false;
    const key = item.title
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/[\s\p{P}\p{S}]+/gu, " ");
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
});

}
function renderKnowledgeGraphLoading() {
    const container = $("knowledgeMap");
    if (!container) return;
    knowledgeGraphSignature = "";
    clearMemoryNode(container);
    container.setAttribute("aria-busy", "true");
    const skeleton = memoryNode("div", "knowledge-map-skeleton", "Bilgi haritası hazırlanıyor…");
    skeleton.setAttribute("role", "status");
    skeleton.setAttribute("aria-hidden", "true");
    container.appendChild(skeleton);
}

function renderKnowledgeGraphError() {
    const container = $("knowledgeMap");
    if (!container) return;
    knowledgeGraphSignature = "";
    clearMemoryNode(container);
    container.removeAttribute("aria-busy");
    const error = memoryNode("div", "knowledge-map-empty", "Bilgi haritası şu an oluşturulamadı.");
    error.setAttribute("role", "status");
    container.appendChild(error);
}

function renderKnowledgeGraph(map = {}) {
    const container = $("knowledgeMap");
    if (!container) return;
    map = map && typeof map === "object" ? map : {};
    container.classList.add("knowledge-map-graph");
    container.setAttribute("aria-label", "Bilgi Haritası");
    const text = value => (typeof value === "string" || typeof value === "number") ? String(value).trim() : "";
    const key = value => text(value).toLocaleLowerCase("tr-TR").replace(/[\s\p{P}\p{S}]+/gu, " ");
    const center = text(map.topic) || "Araştırma";
    const centerKey = key(center);
    const signature = JSON.stringify({
        center: centerKey,
        related: (Array.isArray(map.related) ? map.related : []).slice(0, 12).map(item => key(typeof item === "string" ? item : item?.title)),
        connections: (Array.isArray(map.connections) ? map.connections : []).slice(0, 12).map(item => [key(item?.from), key(item?.to)]),
        concepts: (Array.isArray(map.keyConcepts) ? map.keyConcepts : []).slice(0, 12).map(item => key(typeof item === "string" ? item : item?.term || item?.title || item?.name)),
        history: (Array.isArray(map.history) ? map.history : []).slice(-8).map(item => key(item?.topic))
    });
    if (knowledgeGraphSignature === signature && container.firstChild) return;
    knowledgeGraphSignature = signature;
    clearMemoryNode(container);
    const nodes = [];
    const seen = new Set([centerKey]);
    const edges = new Set();
    const add = (label, kind, tag, previous = false, ring = 1) => {
        label = text(label);
        const normalized = key(label);
        if (!label || seen.has(normalized) || nodes.length >= 23) return null;
        seen.add(normalized);
        const node = { label, kind, tag, previous, ring };
        nodes.push(node);
        return node;
    };
    const connect = node => {
        if (!node) return;
        const edge = [centerKey, key(node.label)].sort().join("::");
        if (edge !== `${centerKey}::${centerKey}` && edges.size < 12) edges.add(edge);
    };
    (Array.isArray(map.related) ? map.related : []).slice(0, 12).forEach(item => {
        const node = add(typeof item === "string" ? item : item?.title, "related", "İlişkili konu", false, 1);
        connect(node);
    });
    (Array.isArray(map.connections) ? map.connections : []).slice(0, 12).forEach(item => {
        const from = text(item?.from); const to = text(item?.to);
        if (!from || !to || key(from) === key(to)) return;
        const label = key(from) === centerKey ? to : from;
        const node = add(label, "memory", "Hafıza bağlantısı", key(from) !== centerKey, 1);
        connect(node);
    });
    (Array.isArray(map.keyConcepts) ? map.keyConcepts : []).slice(0, 12).forEach(item => {
        const node = add(typeof item === "string" ? item : item?.term || item?.title || item?.name, "concept", "Anahtar kavram", false, 2);
        connect(node);
    });
    (Array.isArray(map.history) ? map.history : []).slice(-8).forEach(item => {
        const node = add(item?.topic, "memory", "Önceki konu", true, 2);
        connect(node);
    });
    if (!nodes.length) {
        container.appendChild(memoryNode("div", "knowledge-map-empty", "Bu konu için henüz bilgi haritası oluşturulamadı."));
        return;
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "knowledge-map-svg");
    svg.setAttribute("viewBox", "0 0 900 440");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${center} bilgi haritası`);
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${center} bilgi haritası`;
    svg.appendChild(title);
    const points = new Map([[centerKey, { x: 450, y: 220 }]]);
    nodes.forEach((node, index) => {
        const ringNodes = nodes.filter(item => item.ring === node.ring);
        const ringIndex = ringNodes.indexOf(node);
        const angle = ringIndex / Math.max(1, ringNodes.length) * Math.PI * 2 - Math.PI / 2;
        const radiusX = node.ring === 2 ? 210 : 300;
        const radiusY = node.ring === 2 ? 105 : 150;
        points.set(key(node.label), { x: 450 + Math.cos(angle) * radiusX, y: 220 + Math.sin(angle) * radiusY });
    });
    edges.forEach(edge => {
        const [aKey, bKey] = edge.split("::");
        const a = points.get(aKey); const b = points.get(bKey);
        if (!a || !b) return;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
        line.setAttribute("class", "knowledge-map-edge");
        line.setAttribute("aria-hidden", "true");
        svg.appendChild(line);
    });
    [{ label: center, kind: "center", tag: "Araştırılan konu" }, ...nodes].forEach(node => {
        const point = points.get(key(node.label));
        if (!point) return;
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", `knowledge-map-node is-${node.kind}${node.previous ? " is-previous" : ""}`);
        group.setAttribute("tabindex", "0");
        group.setAttribute("role", "button");
        group.setAttribute("aria-label", `${node.label}, ${node.tag}`);
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", point.x); circle.setAttribute("cy", point.y); circle.setAttribute("r", node.kind === "center" ? "56" : "34");
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", point.x); label.setAttribute("y", point.y + 4); label.setAttribute("text-anchor", "middle");
        label.textContent = node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label;
        group.append(circle, label);
        if (node.kind !== "center") {
            const activate = () => { const input = $("questionInput"); if (input) { input.value = node.label; input.focus(); researchTopic(); } };
            group.addEventListener("click", activate);
            group.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
        }
        svg.appendChild(group);
    });
    container.appendChild(svg);
}

function renderKnowledgeMap(map){

    const container = $("knowledgeMap");

    if(!container) return;

    container.innerHTML = "";

    if(!map.nodes || !map.nodes.length){

        container.innerHTML =
            "<p>Bu konu için yeterli bağlantı bulunamadı.</p>";

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
   LIVING MEMORY WORKSPACE 12.0
========================================================= */

function memoryNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = safeText(value);
    return node;
}

function clearMemoryNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
}

function renderMemorySkeleton(node, count = 2) {
    clearMemoryNode(node);
    if (node) node.setAttribute("aria-busy", "true");
    for (let index = 0; index < count; index += 1) {
        const item = memoryNode("div", "living-memory-skeleton");
        item.setAttribute("aria-hidden", "true");
        item.append(memoryNode("span"), memoryNode("span"));
        node.appendChild(item);
    }
}

function renderMemoryEmpty(node, title, message) {
    clearMemoryNode(node);
    node.removeAttribute("aria-busy");
    const empty = memoryNode("div", "living-memory-empty");
    empty.append(memoryNode("strong", "", title), memoryNode("span", "", message));
    node.appendChild(empty);
}

function memoryTopicButton(topic, className = "living-memory-item") {
    const button = memoryNode("button", className);
    button.type = "button";
    button.appendChild(memoryNode("strong", "", topic || "Konu"));
    button.addEventListener("click", () => {
        const input = $("questionInput");
        if (!input || !topic) return;
        input.value = topic;
        input.focus();
        researchTopic();
    });
    return button;
}

function renderMemoryHistory(history) {
    const node = $("memoryHistoryContainer");
    if (!node) return;
    if (!history.length) {
        renderMemoryEmpty(node, "Henüz öğrenme geçmişin yok.", "İlk araştırmanı yaparak Yaşayan Hafızanı oluşturmaya başlayabilirsin.");
        return;
    }
    clearMemoryNode(node);
    node.removeAttribute("aria-busy");
    history.slice(-5).reverse().forEach(item => {
        const card = memoryTopicButton(item.topic);
        const parsedDate = item.createdAt ? new Date(item.createdAt) : null;
        const date = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toLocaleDateString("tr-TR") : "Tarih yok";
        card.appendChild(memoryNode("small", "", `Öğrenildi: ${date}`));
        const meta = memoryNode("span", "living-memory-item-meta");
        meta.append(
            memoryNode("span", "living-memory-chip", `Confidence: ${item.confidence ?? "—"}`),
            memoryNode("span", "living-memory-chip", `Reliability: ${item.reliabilitySummary?.score ?? "—"}`)
        );
        card.appendChild(meta);
        node.appendChild(card);
    });
}

function renderMemoryReview(review) {
    const node = $("memoryReviewContainer");
    if (!node) return;
    const dueByTopic = new Map();
    review.filter(item => item.due && [1, 3, 7, 30].includes(Number(item.intervalDays))).forEach(item => {
        const topic = safeText(item.topic);
        if (!topic) return;
        const key = topic.toLocaleLowerCase("tr-TR");
        const current = dueByTopic.get(key);
        if (!current || Number(item.intervalDays) < Number(current.intervalDays)) dueByTopic.set(key, item);
    });
    const due = [...dueByTopic.values()];
    if (!due.length) {
        renderMemoryEmpty(node, "Bugün tekrar zamanı yok.", "Yeni bir araştırma yaptığında tekrar önerileri burada görünecek.");
        return;
    }
    clearMemoryNode(node);
    node.removeAttribute("aria-busy");
    due.slice(0, 8).forEach(item => {
        const card = memoryTopicButton(item.topic, "living-memory-item living-memory-review");
        card.appendChild(memoryNode("small", "", `${item.intervalDays} gün aralığı`));
        const action = memoryNode("span", "living-memory-review-action", "Gözden geçir");
        card.appendChild(action);
        node.appendChild(card);
    });
}

function renderMemoryConnections(connections) {
    const node = $("memoryConnectionsContainer");
    if (!node) return;
    if (!connections.length) {
        renderMemoryEmpty(node, "Henüz bağlantı yok.", "İlişkili konular araştırdıkça öğrenme haritan oluşacak.");
        return;
    }
    clearMemoryNode(node);
    node.removeAttribute("aria-busy");
    const seen = new Set();
    connections.slice(0, 24).forEach(connection => {
        const from = safeText(connection?.from);
        const to = safeText(connection?.to);
        if (!from || !to || from.toLocaleLowerCase("tr-TR") === to.toLocaleLowerCase("tr-TR")) return;
        const key = [from, to].map(value => value.toLocaleLowerCase("tr-TR")).sort().join("::");
        if (seen.has(key)) return;
        seen.add(key);
        const card = memoryTopicButton(to, "living-memory-item");
        card.insertBefore(memoryNode("small", "", from), card.firstChild);
        card.appendChild(memoryNode("small", "", "↕ İlişkili konu"));
        node.appendChild(card);
    });
    if (!node.children.length) renderMemoryEmpty(node, "Henüz bağlantı yok.", "İlişkili konular araştırdıkça öğrenme haritan oluşacak.");
}

function renderMemoryStats(stats) {
    const node = $("memoryStatsContainer");
    if (!node) return;
    clearMemoryNode(node);
    node.removeAttribute("aria-busy");
    const numberOrZero = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const textOrDash = value => safeText(value) || "—";
    const values = [
        [numberOrZero(stats.totalTopics), "Toplam konu"],
        [numberOrZero(stats.totalSources), "Toplam kaynak"],
        [numberOrZero(stats.connectionCount), "Bağlantılar"],
        [textOrDash(stats.mostStudiedTopic), "En çok çalışılan"],
        [numberOrZero(stats.averageConfidence), "Ortalama güven"]
    ];
    values.forEach(([value, label]) => {
        const stat = memoryNode("div", "living-memory-stat");
        stat.append(memoryNode("strong", "", value), memoryNode("small", "", label));
        node.appendChild(stat);
    });
}

function renderMemoryTimeline(history) {
    const node = $("memoryTimelineContainer");
    if (!node) return;
    if (!history.length) {
        renderMemoryEmpty(node, "Öğrenme zincirin burada oluşacak.", "İlk konundan sonra önceki ve sonraki adımlarını görebilirsin.");
        return;
    }
    clearMemoryNode(node);
    node.removeAttribute("aria-busy");
    history.slice(-8).forEach((item, index, list) => {
        if (item.previousTopic) node.appendChild(memoryNode("span", "living-memory-timeline-arrow", "←"));
        const current = memoryNode("div", "living-memory-timeline-node");
        current.append(memoryNode("small", "", item.previousTopic ? "Devam" : "Başlangıç"), memoryNode("strong", "", item.topic));
        if (item.nextTopic) current.appendChild(memoryNode("small", "", `Sonraki: ${item.nextTopic}`));
        node.appendChild(current);
        if (index < list.length - 1) node.appendChild(memoryNode("span", "living-memory-timeline-arrow", "→"));
    });
}

function renderLivingMemoryWorkspace(data) {
    const status = $("memoryWorkspaceStatus");
    if (status) {
        status.textContent = "Güncel";
        status.classList.remove("is-error");
    }
    renderMemoryHistory(Array.isArray(data.history) ? data.history : []);
    renderMemoryConnections(Array.isArray(data.connections) ? data.connections : []);
    renderMemoryReview(Array.isArray(data.review) ? data.review : []);
    renderMemoryStats(data.stats || {});
    renderMemoryTimeline(Array.isArray(data.history) ? data.history : []);
    initializeHorizontalRails();
    if (currentResearch) {
        const ai = currentResearch.ai || {};
        renderKnowledgeGraph({
            topic: currentResearch.query || currentResearch.title || "",
            related: normalizeList(currentResearch.related || currentResearch.relatedTopics || ai.relatedTopics || []),
            keyConcepts: currentResearch.structuredContent?.keyConcepts || ai.keyConcepts || [],
            connections: data.connections || [],
            history: data.history || []
        });
    }
}

function renderLivingMemoryError() {
    const status = $("memoryWorkspaceStatus");
    if (status) {
        status.textContent = "Hafıza şu an kullanılamıyor";
        status.classList.add("is-error");
    }
    ["memoryHistoryContainer", "memoryConnectionsContainer", "memoryReviewContainer", "memoryStatsContainer", "memoryTimelineContainer"].forEach(id => {
        const node = $(id);
        if (node) renderMemoryEmpty(node, "Hafıza yüklenemedi.", "Araştırma ekranı çalışmaya devam ediyor; daha sonra tekrar deneyebilirsin.");
    });
}

async function refreshLivingMemoryWorkspace(force = false) {
    if (!canUsePersistentApi()) {
        livingMemoryData = { history: [], connections: [], review: [], stats: {} };
        renderLivingMemoryWorkspace(livingMemoryData);
        return livingMemoryData;
    }
    if (livingMemoryRequest && !force) return livingMemoryRequest;
    if (force && livingMemoryController) livingMemoryController.abort();
    const sequence = ++livingMemorySequence;
    const controller = new AbortController();
    livingMemoryController = controller;
    const status = $("memoryWorkspaceStatus");
    ["memoryHistoryContainer", "memoryConnectionsContainer", "memoryReviewContainer", "memoryStatsContainer", "memoryTimelineContainer"].forEach(id => renderMemorySkeleton($(id)));
    const requests = [
        ["history", "/api/memory/history", []],
        ["connections", "/api/memory/connections", []],
        ["review", "/api/memory/review", []],
        ["stats", "/api/memory/stats", {}]
    ];
    livingMemoryRequest = Promise.allSettled(requests.map(([, endpoint]) => getJSON(API + endpoint, { signal: controller.signal }))).then(results => {
        if (sequence !== livingMemorySequence) return null;
        const data = { history: [], connections: [], review: [], stats: {} };
        const failed = [];
        results.forEach((result, index) => {
            const [key, , fallback] = requests[index];
            if (result.status === "fulfilled") {
                const payload = result.value || {};
                data[key] = payload[key] || fallback;
            } else if (result.reason?.name !== "AbortError") {
                failed.push(key);
            }
        });
        livingMemoryData = data;
        renderLivingMemoryWorkspace(livingMemoryData);
        failed.forEach(key => {
            const id = `memory${key.charAt(0).toUpperCase()}${key.slice(1)}Container`;
            renderMemoryEmpty($(id), "Bu hafıza bölümü yüklenemedi.", "Araştırma ekranı çalışmaya devam ediyor.");
        });
        return livingMemoryData;
    }).catch(error => {
        if (error?.name === "AbortError" || sequence !== livingMemorySequence) return null;
        console.warn("Living Memory workspace:", error?.message || "Memory endpoint başarısız.");
        renderLivingMemoryError();
        return null;
    }).finally(() => {
        if (sequence !== livingMemorySequence) return;
        livingMemoryRequest = null;
        livingMemoryController = null;
        if (status && !status.classList.contains("is-error")) status.textContent = "Güncel";
    });
    return livingMemoryRequest;
}

function renderLivingMemoryResult(data) {
    const banner = $("livingMemoryResultBanner");
    if (!banner) return;
    clearMemoryNode(banner);
    const suggestions = Array.isArray(data?.livingMemory?.suggestions) ? data.livingMemory.suggestions : [];
    if (!suggestions.length) {
        banner.hidden = true;
        return;
    }
    const title = memoryNode("strong", "", "🧠 Bu konuyu daha önce araştırmıştın.");
    const detail = memoryNode("small", "", suggestions.map(item => item.text).filter(Boolean).join(" "));
    banner.append(title, detail);
    const review = suggestions.find(item => item.type === "review");
    if (review?.topic) {
        const button = memoryNode("button", "", "Kaldığın yerden devam et");
        button.type = "button";
        button.addEventListener("click", () => {
            const input = $("questionInput");
            if (input) { input.value = review.topic; input.focus(); researchTopic(); }
        });
        banner.appendChild(button);
    }
    banner.hidden = false;
}

/* =========================================================
   LEGACY MEMORY ENGINE
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

const articles = getSourceArticles(data).length;

const images = getUniqueImages(data.images).length;

const facts =
Array.isArray(data.brain?.facts)
? data.brain.facts.length
: Array.isArray(data.ai?.facts)
? data.ai.facts.length
: Array.isArray(data.facts)
? data.facts.length
: Number(data.stats?.facts || 0);

const sources = articles;

const related = Array.isArray(data.related) ? data.related.length : 0;
const flashcards = Array.isArray(data.brain?.flashcards)
? data.brain.flashcards.length : 0;

container.innerHTML =

statCard("📚","Araştırma kaynağı",articles) +
statCard("🖼️","Görsel",images) +
statCard("🧠","Temel bilgi",facts) +
statCard("🔗","Kaynak",sources);

/* Additional data-driven counters are appended without changing the
   existing four-card layout. */
container.innerHTML +=
statCard("🔗", "İlişkili konu", related) +
statCard("🗂️", "Flashcard", flashcards);

const footerSources = $("footerSourceCount");
const footerImages = $("footerImageCount");
if (footerSources) footerSources.textContent = String(sources);
if (footerImages) footerImages.textContent = String(images);

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

function addSource(title,url,source){

url = window.ResultRenderers && window.ResultRenderers.safeUrl
    ? window.ResultRenderers.safeUrl(url)
    : "";
if(!url) return;

if(!sourceMap.has(url)){
    sourceMap.set(url, {
        title: title || "Kaynak",
        source: source || title || "Kaynak"
    });
}

}

addSource(
data.title ||
currentAnalysis?.topic ||
"Ana kaynak",
data.url ||
data.sourceUrl,
data.engine || "Brain Engine"
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
article.url || article.link,
article.source
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

sourceMap.forEach((meta,url)=>{

const row =
document.createElement("div");

row.className = "source-item";

row.innerHTML =
'<div class="source-name">' +
escapeHTML(meta.title) +
'</div>' +

'<div class="source-type">' +
escapeHTML(meta.source) +
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

if (text.includes("sağlık") || text.includes("tıp") ||
    text.includes("insülin") || text.includes("diyabet") ||
    text.includes("metabolizma") || text.includes("hipertansiyon")) {
    return "İnsan ve Sağlık";
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

if(isDemoMode()) return [];
if(window.YasayanDefterAuth?.authenticated === true) return persistentNotebook;

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

async function saveCurrentTopic(){

if(!currentResearch) return;

if(isDemoMode()){
$("saveTopicButton").textContent = "Kaydetmek için giriş yap";
$("saveTopicButton").classList.remove("saved");
document.querySelector("[data-open-login]")?.focus();
return;
}

const title =
currentResearch.title ||
currentAnalysis?.topic ||
"Konusuz araştırma";

if(window.YasayanDefterAuth?.authenticated === true){

try{

const memory = await awaitMemorySave();
persistentNotebook = [
memoryToNotebook(memory),
...persistentNotebook.filter(item=>item.id !== memory.id && item.title !== memory.title)
];

}catch(_error){

showError("Araştırma şu anda Defterim'e kaydedilemedi. Lütfen daha sonra tekrar dene.");
return;

}

}else{

const saved = getSavedTopics();

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

}

learningState.save = true;

$("stepSave").classList.add("done");

updateProgress();
updateSaveButton();
renderNotebook();

$("saveTopicButton").textContent =
"✓ Deftere kaydedildi";

$("saveTopicButton").classList.add("saved");

}

async function awaitMemorySave(){

if (isDemoMode()) return;

const payload = {

title:
currentResearch.title ||
currentAnalysis?.topic ||
"",

topic:
currentResearch.title ||
currentAnalysis?.topic ||
"",

query:
currentResearch.query ||
currentAnalysis?.original ||
"",

summary:
$("summaryText").textContent,

keyFacts:
currentResearch.structuredContent?.keyFacts ||
currentResearch.ai?.facts ||
currentResearch.brain?.facts ||
currentResearch.facts ||
[],

keyConcepts:
currentResearch.structuredContent?.keyConcepts || [],

relatedTopics:
currentResearch.structuredContent?.relatedTopics ||
currentResearch.relatedTopics || [],

...(window.YDSmartNoteSaveOptions || {})

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

const data = await response.json();
return data.memory;

}

function memoryToNotebook(memory){

return {
id:memory.id,
title:memory.title || memory.topic || "Kayıtlı araştırma",
originalTitle:memory.originalTitle || memory.topic || memory.title || "",
question:memory.topic || memory.title || "",
summary:memory.summary || "",
facts:memory.keyFacts || [],
interesting:"",
date:memory.updatedAt ? new Date(memory.updatedAt).toLocaleString("tr-TR") : "",
updatedAt:memory.updatedAt || "",
createdAt:memory.createdAt || "",
isPinned:Boolean(memory.isPinned),
isArchived:Boolean(memory.isArchived),
workspaceArea:memory.workspaceArea || "research",
contentType:memory.contentType || "research",
customTitle:memory.customTitle || "",
tags:Array.isArray(memory.tags) ? memory.tags : [],
noteMetadata:memory.noteMetadata || {}
};

}

async function loadPersistentNotebook(){

if(window.YasayanDefterAuth?.authenticated !== true){
persistentNotebook = [];
renderNotebook();
return;
}

try{

const response = await fetch(API + "/api/memory/list", { headers:{ "Accept":"application/json" } });
if(!response.ok) throw new Error("MEMORY_LIST_FAILED");
const data = await response.json();
persistentNotebook = Array.isArray(data.memories) ? data.memories.map(memoryToNotebook) : [];
window.YDSmartNotes?.setPage?.(data.page || {});
renderNotebook();
updateSaveButton();

}catch(_error){

persistentNotebook = [];
renderNotebook("Defterim kayıtları şu anda yüklenemedi.");

}

}

function updateSaveButton(){

if(!currentResearch) return;

if(isDemoMode()){
$("saveTopicButton").textContent = "Kaydetmek için giriş yap";
$("saveTopicButton").classList.remove("saved");
return;
}

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

function renderNotebook(errorMessage){

    const box = $("notebookList");

    if(!box) return;

    const saved = getSavedTopics();
if(window.YDSmartNotes?.render && window.YasayanDefterAuth?.authenticated === true){
window.YDSmartNotes.render(saved,errorMessage);
return;
}
if(!saved.length){

box.innerHTML =
'<div class="fact">' +
'<h4>' + (isDemoMode() ? 'Araştırmalarını kaydet' : 'Defterin henüz boş') + '</h4>' +
'<p>' + escapeHTML(errorMessage || (isDemoMode() ? 'Kalıcı Defterim için giriş yap veya hesap oluştur. Araştırmaya giriş yapmadan devam edebilirsin.' : 'Bir araştırma yap ve “Bu konuyu kaydet” düğmesine bas.')) + '</p>' +
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
 (!isDemoMode() ? '<button type="button" class="delete-save">Sil</button>' : '');

const deleteButton = row.querySelector(".delete-save");
if(deleteButton){
deleteButton.setAttribute("aria-label", `${item.title || "Defter"} araştırmasını sil`);
deleteButton.onclick = async event=>{

event.stopPropagation();

if(await confirmMemoryDelete(item)) await deleteSavedTopic(item.id);

};
}

row.onclick = ()=>{

loadSavedTopic(item);

};

box.appendChild(row);

});

}

function confirmMemoryDelete(item){

return new Promise(resolve=>{
let dialog = $("memoryDeleteDialog");
if(!dialog){
dialog = document.createElement("dialog");
dialog.id = "memoryDeleteDialog";
dialog.className = "memory-delete-dialog";
dialog.setAttribute("aria-labelledby","memoryDeleteTitle");
const title = document.createElement("h2"); title.id = "memoryDeleteTitle"; title.textContent = "Defter kaydını sil";
const message = document.createElement("p"); message.className = "memory-delete-message";
const actions = document.createElement("div"); actions.className = "memory-delete-actions";
const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "memory-delete-cancel"; cancel.textContent = "Vazgeç";
const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete-save memory-delete-confirm"; remove.textContent = "Kaydı sil";
actions.append(cancel,remove); dialog.append(title,message,actions); document.body.appendChild(dialog);
}
const message = dialog.querySelector(".memory-delete-message"); message.textContent = `“${item.title || "Bu araştırma"}” Defterim'den kalıcı olarak silinsin mi?`;
const cancel = dialog.querySelector(".memory-delete-cancel"); const remove = dialog.querySelector(".memory-delete-confirm");
let settled = false; const finish = value=>{ if(settled) return; settled = true; dialog.close(); message.textContent = ""; resolve(value); };
cancel.onclick = ()=>finish(false); remove.onclick = ()=>finish(true); dialog.oncancel = event=>{ event.preventDefault(); finish(false); };
dialog.showModal(); cancel.focus();
});

}

async function deleteSavedTopic(id){

if(window.YasayanDefterAuth?.authenticated === true){
try{
const response = await fetch(API + "/api/memory/" + encodeURIComponent(id), { method:"DELETE", headers:{ "Accept":"application/json" } });
if(!response.ok) throw new Error("MEMORY_DELETE_FAILED");
persistentNotebook = persistentNotebook.filter(item=>item.id !== id);
}catch(_error){
showError("Defter kaydı şu anda silinemedi. Lütfen daha sonra tekrar dene.");
return;
}
}else{

const saved =
getSavedTopics()
.filter(item=>item.id !== id);

localStorage.setItem(
"yasayanDefterNotebook",
JSON.stringify(saved)
);

}

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
    loading.setAttribute("aria-busy", String(Boolean(show)));

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
data.engine || ("Brain Engine " + (data.version || "hazır"));

return;

}

}catch(error){

console.warn("Status endpoint:",error);

}

if (!isDemoMode()) try{

const data =
await getJSON(
API + "/api/analyze?q=durum"
);

if(data?.ok){

$("statusText").textContent =
data.engine || ("Brain Engine " + (data.version || "hazır"));

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
    if (canUsePersistentApi()) refreshLivingMemoryWorkspace();

    if (typeof updateClock === "function") {
        updateClock();
    }

    if (typeof animateCounter === "function") {
        animateCounter("sourceCounter",120);
        animateCounter("imageCounter",1);
        animateCounter("speedCounter",0.8);
    }

    console.log("🧠 Yaşayan Defter 15.0 Pilot hazır");

}

window.addEventListener("yasayan-auth-ready", function () {
    loadPersistentNotebook();
    if (canUsePersistentApi() || isDemoMode()) refreshLivingMemoryWorkspace();
});

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
