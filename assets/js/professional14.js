(function () {
    "use strict";

    var STORAGE_KEY = "yasayan-defter-professional14";
    var state = loadState();
    var latestLearningProfile = null;

    function loadState() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (error) { return {}; }
    }

    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* storage is optional */ }
    }

    function createElement(tag, attrs, text) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
        if (text) node.textContent = text;
        return node;
    }

    function addTeacherControls() {
        var target = document.getElementById("teacherSimple");
        if (!target || document.getElementById("teacherModeToolbar")) return;
        var toolbar = createElement("div", { id: "teacherModeToolbar", class: "pro14-toolbar", role: "group", "aria-label": "Öğretmen modu ayarları" });
        var level = createElement("select", { id: "teacherLevel", "aria-label": "Öğrenme seviyesi" });
        [["primary", "İlkokul"], ["middle", "Ortaokul"], ["high", "Lise"], ["university", "Üniversite"], ["academic", "Akademik"]].forEach(function (item) {
            level.appendChild(createElement("option", { value: item[0] }, item[1]));
        });
        level.value = state.teacherLevel || "middle";
        level.addEventListener("change", function () { state.teacherLevel = level.value; saveState(); toolbar.dataset.level = level.value; });
        toolbar.appendChild(level);
        ["Hikaye", "Günlük örnek", "Çok kısa", "Normal", "Detaylı ders", "Sınava hazırlık"].forEach(function (label) {
            var button = createElement("button", { type: "button", class: "pro14-mode", "data-mode": label }, label);
            button.addEventListener("click", function () {
                state.teacherMode = label; saveState();
                toolbar.querySelectorAll(".pro14-mode").forEach(function (item) { item.classList.toggle("is-active", item === button); });
                toolbar.setAttribute("aria-label", "Öğretmen modu: " + label);
            });
            toolbar.appendChild(button);
        });
        target.parentNode.insertBefore(toolbar, target);
    }

    function addQuizControls() {
        var question = document.getElementById("quizQuestion");
        if (!question || document.getElementById("quizSettings")) return;
        var controls = createElement("div", { id: "quizSettings", class: "pro14-toolbar", role: "group", "aria-label": "Quiz ayarları" });
        var count = createElement("select", { id: "quizCount", "aria-label": "Soru sayısı" });
        [5, 10, 20].forEach(function (value) { count.appendChild(createElement("option", { value: value }, value + " soru")); });
        count.value = state.quizCount || "5";
        count.addEventListener("change", function () { state.quizCount = count.value; saveState(); });
        var type = createElement("select", { id: "quizType", "aria-label": "Soru türü" });
        ["Çoktan seçmeli", "Doğru / Yanlış", "Boşluk doldurma", "Eşleştirme"].forEach(function (value) { type.appendChild(createElement("option", { value: value }, value)); });
        type.value = state.quizType || "Çoktan seçmeli";
        type.addEventListener("change", function () { state.quizType = type.value; saveState(); });
        controls.appendChild(count); controls.appendChild(type);
        question.parentNode.insertBefore(controls, question);
    }

    function addScoreAndRecommendations() {
        var results = document.getElementById("results");
        if (!results || document.getElementById("brainScorePanel")) return;
        var panel = createElement("section", { id: "brainScorePanel", class: "section pro14-panel", "aria-labelledby": "brainScoreTitle" });
        panel.innerHTML = '<div class="section-head"><div><h3 id="brainScoreTitle" class="section-title">Brain Score</h3><div class="section-subtitle">Araştırma, quiz ve ilerleme verilerinden hesaplanan öğrenme göstergesi.</div></div><strong class="pro14-score" id="brainScoreValue">—</strong></div><div class="section-body"><div class="pro14-progress"><span id="brainScoreProgress"></span></div><p id="brainScoreHint">Bu değer bilimsel bir zekâ ölçümü değildir. Hesap verin oluştukça güncellenir.</p><div class="pro14-recommendation" id="smartRecommendation">Bir araştırma yaparak öğrenme ilerlemeni başlatabilirsin.</div></div>';
        results.insertBefore(panel, results.firstElementChild);
        updateScore();
    }

    function updateScore(profile) {
        var value = document.getElementById("brainScoreValue");
        var progress = document.getElementById("brainScoreProgress");
        if (!value || !progress) return;
        var score = Number((profile || latestLearningProfile)?.brainScore);
        if (!Number.isFinite(score)) { value.textContent = "—"; progress.style.width = "0%"; return; }
        score = Math.max(0, Math.min(100, Math.round(score)));
        value.textContent = score + "%"; progress.style.width = score + "%";
    }

    function enhanceFlashcards() {
        document.querySelectorAll("#flashcardsContainer .flashcard").forEach(function (card) {
            if (card.dataset.pro14Bound) return;
            card.dataset.pro14Bound = "true";
            card.tabIndex = 0; card.setAttribute("role", "button"); card.setAttribute("aria-label", "Kartı çevir");
            var flip = function () { card.classList.toggle("is-flipped"); };
            card.addEventListener("click", flip); card.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); flip(); } });
        });
    }

    function enhanceNotebook() {
        var list = document.getElementById("notebookList");
        if (!list || document.getElementById("notebookSearchPro14")) return;
        var input = createElement("input", { id: "notebookSearchPro14", class: "pro14-search", type: "search", placeholder: "Notlarda ara…", "aria-label": "Notlarda ara" });
        input.addEventListener("input", function () { var query = input.value.toLocaleLowerCase("tr-TR"); list.querySelectorAll(".notebook-item, .notebook-card, li").forEach(function (item) { item.hidden = query && !item.textContent.toLocaleLowerCase("tr-TR").includes(query); }); });
        list.parentNode.insertBefore(input, list);
    }

    function observeResults() {
        var results = document.getElementById("results");
        if (!results || !window.MutationObserver) return;
        var scheduled = false;
        var refresh = function () {
            scheduled = false;
            addScoreAndRecommendations();
            enhanceFlashcards();
            updateScore();
        };
        var observer = new MutationObserver(function () {
            if (scheduled) return;
            scheduled = true;
            if (window.requestAnimationFrame) {
                window.requestAnimationFrame(refresh);
            } else {
                window.setTimeout(refresh, 0);
            }
        });
        observer.observe(results, { childList: true, subtree: true });
    }

    document.addEventListener("DOMContentLoaded", function () {
        addTeacherControls(); addQuizControls(); addScoreAndRecommendations(); enhanceNotebook(); observeResults();
    });
    window.addEventListener("learning:profile", function (event) { latestLearningProfile = event.detail || null; updateScore(latestLearningProfile); });
}());
