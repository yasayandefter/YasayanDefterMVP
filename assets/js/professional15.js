(function () {
    "use strict";

    var KEY = "yasayan-defter-commercial-profile";
    var defaults = { name: "Yaşayan Öğrenci", level: "Ortaokul", research: 0, quizzes: 0, xp: 0, streak: 1, recent: [] };
    var state = read();

    function read() {
        try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (error) { return Object.assign({}, defaults); }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (error) { /* optional storage */ } }
    function el(tag, attrs, content) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
        if (content !== undefined) node.textContent = content;
        return node;
    }
    function toast(message, kind) {
        var host = document.getElementById("commercialToastHost") || (function () { var x = el("div", { id: "commercialToastHost", "aria-live": "polite" }); document.body.appendChild(x); return x; }());
        var item = el("div", { class: "commercial-toast " + (kind || "success") }, message);
        host.appendChild(item);
        window.setTimeout(function () { item.classList.add("is-out"); window.setTimeout(function () { item.remove(); }, 260); }, 3200);
    }
    function scrollTo(id) { var node = document.getElementById(id); if (node) node.scrollIntoView({ behavior: "smooth", block: "start" }); }

    function addWorkspaceNavigation() {
        var header = document.querySelector("#brainEngineWorkspace > .header");
        if (!header || document.getElementById("commercialNav")) return;
        var nav = el("nav", { id: "commercialNav", class: "commercial-nav", "aria-label": "Brain Engine bölümleri" });
        [["home", "Ana sayfa", "brainEngineWorkspace"], ["research", "Araştır", "questionInput"], ["teacher", "Öğretmen", "teacherSimple"], ["quiz", "Quiz", "quizQuestion"], ["notebook", "Notebook", "notebookSection"], ["profile", "Profil", "commercialProfile"], ["settings", "Ayarlar", "commercialSettings"]].forEach(function (item) {
            var button = el("button", { type: "button", "data-target": item[2], class: "commercial-nav-item" }, item[1]);
            button.addEventListener("click", function () { if (item[0] === "settings") { openSettings(); } else if (item[0] === "profile") { scrollTo("commercialProfile"); } else { scrollTo(item[2]); } });
            nav.appendChild(button);
        });
        header.insertAdjacentElement("afterend", nav);
    }

    function addProfilePanel() {
        var results = document.getElementById("results");
        if (!results || document.getElementById("commercialProfile")) return;
        var panel = el("section", { id: "commercialProfile", class: "commercial-profile pro14-panel", "aria-labelledby": "commercialProfileTitle" });
        panel.innerHTML = '<div class="commercial-profile-head"><div><p class="commercial-kicker">Öğrenme paneli</p><h2 id="commercialProfileTitle">Profilin ve ilerlemen</h2><p class="commercial-muted">Yerel cihazındaki öğrenme akışını tek bakışta takip et.</p></div><button type="button" class="commercial-ghost" id="editProfileButton">Profili düzenle</button></div><div class="commercial-profile-grid"><div class="commercial-profile-identity"><div class="commercial-avatar" aria-hidden="true">YD</div><div><strong id="commercialProfileName"></strong><span id="commercialProfileLevel"></span></div></div><div class="commercial-stat"><strong id="commercialResearchCount">0</strong><span>Araştırma</span></div><div class="commercial-stat"><strong id="commercialQuizCount">0</strong><span>Tamamlanan quiz</span></div><div class="commercial-stat"><strong id="commercialXp">0 XP</strong><span>Öğrenme puanı</span></div><div class="commercial-stat"><strong id="commercialStreak">1 gün</strong><span>Günlük seri</span></div></div><div class="commercial-goals"><div><span>Haftalık hedef</span><strong id="commercialGoalLabel">0 / 5 araştırma</strong></div><div class="commercial-goal-track"><span id="commercialGoalProgress"></span></div><div class="commercial-badges" id="commercialBadges" aria-label="Rozetler"></div></div>';
        results.insertBefore(panel, results.firstElementChild);
        document.getElementById("editProfileButton").addEventListener("click", editProfile);
        renderProfile();
    }
    function renderProfile() {
        var map = { commercialProfileName: state.name, commercialProfileLevel: state.level, commercialResearchCount: state.research, commercialQuizCount: state.quizzes, commercialXp: state.xp + " XP", commercialStreak: state.streak + " gün" };
        Object.keys(map).forEach(function (id) { var node = document.getElementById(id); if (node) node.textContent = map[id]; });
        var progress = Math.min(100, state.research * 20); var bar = document.getElementById("commercialGoalProgress"); if (bar) bar.style.width = progress + "%";
        var label = document.getElementById("commercialGoalLabel"); if (label) label.textContent = Math.min(5, state.research) + " / 5 araştırma";
        var badges = document.getElementById("commercialBadges"); if (badges) { badges.innerHTML = ""; [["İlk adım", state.research > 0], ["Meraklı zihin", state.research >= 3], ["Quiz ustası", state.quizzes > 0]].forEach(function (badge) { badges.appendChild(el("span", { class: badge[1] ? "is-earned" : "" }, badge[1] ? "✦ " + badge[0] : "○ " + badge[0])); }); }
    }

    function renderLearningProgress(profile, recommendations) {
        var panel = document.getElementById("commercialProfile");
        if (!panel) return;
        var authoritative = { commercialResearchCount: Number(profile.researchedTopics) || 0, commercialQuizCount: Number(profile.completedQuizzes) || 0, commercialXp: (Number(profile.totalXP) || 0) + " XP", commercialProfileLevel: "Seviye " + (Number(profile.level) || 1) };
        Object.keys(authoritative).forEach(function (id) { var node = document.getElementById(id); if (node) node.textContent = authoritative[id]; });
        var existing = document.getElementById("learningProgressPanel");
        if (existing) existing.remove();
        var section = el("section", { id: "learningProgressPanel", class: "learning-progress-panel", "aria-labelledby": "learningProgressTitle" });
        var title = el("h3", { id: "learningProgressTitle", class: "commercial-kicker" }, "İlerlemem");
        var grid = el("div", { class: "learning-progress-grid" });
        [["progressXP", "Toplam XP", (Number(profile.totalXP) || 0) + " XP"], ["progressLevel", "Level", String(Number(profile.level) || 1)], ["progressAccuracy", "Başarı", "%" + (Number(profile.accuracy) || 0)], ["progressTopics", "Konular", String(Number(profile.researchedTopics) || 0)], ["progressQuizzes", "Quiz", String(Number(profile.completedQuizzes) || 0)]].forEach(function (item) { var card = el("div", { class: "learning-progress-stat" }); card.append(el("strong", { id: item[0] }, item[2]), el("span", {}, item[1])); grid.appendChild(card); });
        section.append(title, grid);
        var topics = el("div", { class: "learning-progress-topics", "aria-label": "Konu ilerlemeleri" });
        (Array.isArray(profile.topicProgress) ? profile.topicProgress : []).slice(0, 6).forEach(function (item) { var row = el("div", { class: "learning-topic-row" }); row.append(el("strong", {}, item.topic || "Konu"), el("span", {}, "%" + (Number(item.mastery) || 0))); var track = el("div", { class: "learning-topic-track" }); var fill = el("span", {}); fill.style.width = Math.max(0, Math.min(100, Number(item.mastery) || 0)) + "%"; track.appendChild(fill); row.appendChild(track); topics.appendChild(row); });
        section.appendChild(topics);
        var recommendation = el("p", { id: "learningRecommendation", class: "learning-recommendation" }, recommendations?.[0]?.text || "Yeni bir araştırma yaparak ilerlemene başlayabilirsin.");
        section.appendChild(recommendation);
        panel.appendChild(section);
    }

    function loadLearningProgress() {
        fetch("/api/progress", { headers: { "Accept": "application/json" } }).then(function (response) { return response.ok ? response.json() : null; }).then(function (payload) { if (payload?.profile) renderLearningProgress(payload.profile, payload.recommendations || []); }).catch(function () { /* progress is optional */ });
    }
    function editProfile() {
        var name = window.prompt("Profil adın", state.name); if (name === null) return;
        state.name = name.trim() || defaults.name; state.level = window.prompt("Öğrenme seviyen", state.level) || state.level; save(); renderProfile(); toast("Profilin güncellendi.");
    }

    function addSmartSearch() {
        var input = document.getElementById("questionInput"); if (!input || document.getElementById("commercialSearchList")) return;
        var list = el("datalist", { id: "commercialSearchList" }); ["Yapay zeka", "Kuantum fiziği", "İklim değişikliği", "Mars", "DNA", "Osmanlı tarihi"].concat(state.recent).forEach(function (value) { list.appendChild(el("option", { value: value })); });
        input.setAttribute("list", "commercialSearchList"); input.insertAdjacentElement("afterend", list);
        var button = document.getElementById("searchButton"); if (button) button.addEventListener("click", function () { var value = input.value.trim(); if (!value) return; state.recent = [value].concat(state.recent.filter(function (x) { return x !== value; })).slice(0, 6); save(); toast("Araştırma öğrenme paneline eklendi."); }, true);
    }
    function addQuizTracking() {
        return;
        var result = document.getElementById("quizResult"); if (!result || !window.MutationObserver) return;
        var previous = ""; new MutationObserver(function () { var current = result.textContent.trim(); if (current && current !== previous && /başar|doğru|puan|score/i.test(current)) { state.quizzes += 1; state.xp += 25; save(); renderProfile(); toast("Quiz tamamlandı. XP kazandın!"); } previous = current; }).observe(result, { childList: true, subtree: true, characterData: true });
    }
    function addSettings() {
        if (document.getElementById("commercialSettings")) return;
        var modal = el("dialog", { id: "commercialSettings", class: "commercial-settings", "aria-labelledby": "commercialSettingsTitle" });
        modal.innerHTML = '<form method="dialog"><div class="commercial-profile-head"><div><p class="commercial-kicker">Kontrol merkezi</p><h2 id="commercialSettingsTitle">Ayarlar</h2></div><button class="commercial-close" value="cancel" aria-label="Ayarları kapat">×</button></div><label>Tema<select id="commercialTheme"><option value="dark">Koyu gece</option><option value="contrast">Yüksek kontrast</option></select></label><label>Hareket<select id="commercialMotion"><option value="full">Animasyonlar açık</option><option value="reduced">Hareketi azalt</option></select></label><label>Ses <input type="checkbox" id="commercialSound"> Arayüz sesleri</label><div class="commercial-settings-actions"><button class="commercial-ghost" value="cancel">Kapat</button><button class="commercial-primary" id="saveCommercialSettings" value="default">Kaydet</button></div></form>';
        document.body.appendChild(modal); modal.addEventListener("close", function () { document.documentElement.classList.toggle("high-contrast", document.getElementById("commercialTheme").value === "contrast"); document.documentElement.classList.toggle("reduce-motion", document.getElementById("commercialMotion").value === "reduced"); });
    }
    function openSettings() { addSettings(); var modal = document.getElementById("commercialSettings"); if (typeof modal.showModal === "function") modal.showModal(); else modal.setAttribute("open", ""); }
    function addDemoMode() {
        var hero = document.querySelector("#brainEngineWorkspace .hero"); if (!hero || document.getElementById("demoModeButton")) return;
        var button = el("button", { id: "demoModeButton", type: "button", class: "commercial-demo" }, "Demo modunu göster"); button.addEventListener("click", function () { toast("Demo modu: örnek akış hazır. Araştırma verilerin değişmedi."); document.body.classList.toggle("demo-mode"); }); hero.querySelector(".hero-live")?.appendChild(button);
    }
    document.addEventListener("DOMContentLoaded", function () { addWorkspaceNavigation(); addProfilePanel(); addSmartSearch(); addQuizTracking(); addSettings(); addDemoMode(); loadLearningProgress(); });
    window.addEventListener("learning:updated", function () { loadLearningProgress(); });
}());
