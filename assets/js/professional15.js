(function () {
    "use strict";

    var KEY = "yasayan-defter-commercial-profile";
    var defaults = { recent: [] };
    var state = read();

    function authState() { return window.YasayanDefterAuth || {}; }
    function canLoadProgress() { var auth = authState(); return window.YasayanDefterAccess?.isDemoMode() !== true && (auth.authenticated === true || auth.local === true); }
    function canLoadTeacher() { var auth = authState(); return window.YasayanDefterAccess?.isDemoMode() !== true && auth.authenticated === true && auth.user?.role === "TEACHER"; }

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
        [["home", "Ana sayfa", "brainEngineWorkspace"], ["research", "Araştır", "questionInput"], ["teacher", "Öğretmen", "teacherDashboard"], ["quiz", "Quiz", "quizQuestion"], ["notebook", "Notebook", "notebookSection"], ["profile", "Profil", "commercialProfile"], ["settings", "Ayarlar", "commercialSettings"]].forEach(function (item) {
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
        panel.innerHTML = '<div class="commercial-profile-head"><div><p class="commercial-kicker">Öğrenme paneli</p><h2 id="commercialProfileTitle">Profilin ve ilerlemen</h2><p class="commercial-muted" id="commercialProfileNote">Hesap verilerin yüklendiğinde gerçek öğrenme ilerlemen burada görünür.</p></div><button type="button" class="commercial-ghost" id="editProfileButton" hidden>Profili düzenle</button></div><div class="commercial-profile-grid"><div class="commercial-profile-identity"><div class="commercial-avatar" aria-hidden="true">YD</div><div><strong id="commercialProfileName"></strong><span id="commercialProfileLevel"></span></div></div><div class="commercial-stat"><strong id="commercialResearchCount">—</strong><span>Araştırma</span></div><div class="commercial-stat"><strong id="commercialQuizCount">—</strong><span>Tamamlanan quiz</span></div><div class="commercial-stat"><strong id="commercialXp">—</strong><span>Öğrenme puanı</span></div><div class="commercial-stat"><strong id="commercialStreak">—</strong><span>Günlük seri</span></div></div><div class="commercial-goals"><div><span>Haftalık hedef</span><strong id="commercialGoalLabel">Henüz veri yok</strong></div><div class="commercial-goal-track"><span id="commercialGoalProgress"></span></div><div class="commercial-badges" id="commercialBadges" aria-label="Rozetler"></div></div>';
        results.insertAdjacentElement("beforebegin", panel);
        document.getElementById("editProfileButton").addEventListener("click", function () { window.dispatchEvent(new CustomEvent("yasayan-open-profile")); });
        renderProfile();
    }
    function renderProfile() {
        var auth = authState(); var persistent = canLoadProgress();
        var name = persistent ? (auth.user?.displayName || auth.user?.username || auth.user?.email || "Hesap") : "Misafir kullanım";
        var map = { commercialProfileName: name, commercialProfileLevel: persistent ? "Veriler yükleniyor…" : "Kalıcı profil yok", commercialResearchCount: "—", commercialQuizCount: "—", commercialXp: "—", commercialStreak: "—" };
        Object.keys(map).forEach(function (id) { var node = document.getElementById(id); if (node) node.textContent = map[id]; });
        var edit = document.getElementById("editProfileButton"); if (edit) edit.hidden = !(auth.authenticated === true && auth.user);
        var bar = document.getElementById("commercialGoalProgress"); if (bar) bar.style.width = "0%";
        var label = document.getElementById("commercialGoalLabel"); if (label) label.textContent = persistent ? "Veriler yükleniyor…" : "Giriş yapınca takip edilir";
        var note = document.getElementById("commercialProfileNote"); if (note) note.textContent = persistent ? "Gerçek hesap ve öğrenme verilerin gösteriliyor." : "Araştırmayı giriş yapmadan kullanabilirsin; ilerleme ve XP kalıcı olarak kaydedilmez.";
        var badges = document.getElementById("commercialBadges"); if (badges) badges.replaceChildren();
    }

    function renderLearningProgress(profile, recommendations) {
        var panel = document.getElementById("commercialProfile");
        if (!panel) return;
        var streak = profile.streak || {}; var weekly = profile.weeklyGoal || {};
        var authoritative = { commercialResearchCount: Number(profile.researchedTopics) || 0, commercialQuizCount: Number(profile.completedQuizzes) || 0, commercialXp: (Number(profile.totalXP) || 0) + " XP", commercialProfileLevel: "Seviye " + (Number(profile.level) || 1), commercialStreak: (Number(streak.current) || 0) + " gün" };
        Object.keys(authoritative).forEach(function (id) { var node = document.getElementById(id); if (node) node.textContent = authoritative[id]; });
        var researched = Number(profile.researchedTopics) || 0; var target = Math.max(1, Number(weekly.target) || 5); var completed = Math.max(0, Number(weekly.completed) || 0); var goalProgress = document.getElementById("commercialGoalProgress"); if (goalProgress) goalProgress.style.width = Math.min(100, completed / target * 100) + "%"; var goalLabel = document.getElementById("commercialGoalLabel"); if (goalLabel) goalLabel.textContent = completed + " / " + target + " araştırma"; var goals = document.querySelector(".commercial-goals"); if (goals) goals.classList.toggle("is-achieved", weekly.achieved === true); var badges = document.getElementById("commercialBadges"); if (badges) { badges.replaceChildren(); [["İlk adım", researched > 0], ["Meraklı zihin", researched >= 3], ["Quiz ustası", (Number(profile.completedQuizzes) || 0) > 0]].forEach(function (badge) { badges.appendChild(el("span", { class: badge[1] ? "is-earned" : "" }, badge[1] ? "✦ " + badge[0] : "○ " + badge[0])); }); }
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
        window.dispatchEvent(new CustomEvent("learning:profile", { detail: profile }));
    }

    function loadLearningProgress() {
        renderProfile(); if (!canLoadProgress()) return;
        var studentId = ""; try { studentId = localStorage.getItem("yasayan-defter-active-student") || ""; } catch (_) {} var suffix = studentId ? "?studentId=" + encodeURIComponent(studentId) : "";
        fetch("/api/progress" + suffix, { headers: { "Accept": "application/json" } }).then(function (response) { return response.ok ? response.json() : null; }).then(function (payload) { if (payload?.profile) renderLearningProgress(payload.profile, payload.recommendations || []); }).catch(function () { /* progress is optional */ });
    }
    function teacherNode(tag, attrs, content) { return el(tag, attrs, content); }
    function renderTeacherSummary(summary) {
        var panel = document.getElementById("teacherDashboard"); if (!panel) return;
        panel.replaceChildren();
        var head = teacherNode("div", { class: "teacher-dashboard-head" }); head.append(teacherNode("h2", { id: "teacherDashboardTitle" }, "Öğretmen Modu"), teacherNode("p", { class: "commercial-muted" }, "Öğrencinin gerçek öğrenme ilerlemesini tek ekranda izle.")); panel.appendChild(head);
        var overview = teacherNode("div", { class: "teacher-overview-grid" });
        [["teacherLevel", "Seviye", summary.overview.level], ["teacherXP", "Toplam XP", summary.overview.totalXP], ["teacherAccuracy", "Genel başarı", "%" + summary.overview.overallAccuracy], ["teacherQuizzes", "Tamamlanan quiz", summary.overview.completedQuizzes], ["teacherTopics", "Çalışılan konu", summary.overview.researchedTopicCount]].forEach(function (item) { var card = teacherNode("div", { class: "teacher-stat-card" }); card.append(teacherNode("strong", { id: item[0] }, String(item[2])), teacherNode("span", {}, item[1])); overview.appendChild(card); }); panel.appendChild(overview);
        [["Güçlü Alanlar", summary.learningStatus.strongTopics], ["Gelişen Alanlar", summary.learningStatus.developingTopics], ["Desteğe İhtiyaç Var", summary.learningStatus.weakTopics]].forEach(function (group) { var section = teacherNode("section", { class: "teacher-topic-section" }); section.appendChild(teacherNode("h3", {}, group[0])); var rail = teacherNode("div", { class: "teacher-topic-list" }); (group[1] || []).slice(0, 8).forEach(function (topic) { var card = teacherNode("article", { class: "teacher-topic-card" }); card.append(teacherNode("strong", {}, topic.topic), teacherNode("span", { class: "teacher-topic-status" }, topic.statusLabel + " · %" + topic.mastery), teacherNode("small", {}, "Quiz başarı: %" + topic.accuracy)); var track = teacherNode("div", { class: "teacher-topic-track" }); var fill = teacherNode("span", {}); fill.style.width = topic.mastery + "%"; track.appendChild(fill); card.appendChild(track); rail.appendChild(card); }); if (!rail.children.length) rail.appendChild(teacherNode("p", { class: "teacher-empty-inline" }, "Henüz yeterli veri yok.")); section.appendChild(rail); panel.appendChild(section); });
        var columns = teacherNode("div", { class: "teacher-dashboard-columns" }); [["Dikkat Gerektirenler", summary.attentionNeeded || [], "teacher-attention"], ["Öğretmen Önerileri", summary.recommendations || [], "teacher-recommendation"]].forEach(function (group) { var section = teacherNode("section", { class: "teacher-dashboard-card" }); section.appendChild(teacherNode("h3", {}, group[0])); group[1].slice(0, 6).forEach(function (item) { section.appendChild(teacherNode("p", { class: group[2] }, item.text || (item.topic + " — " + item.reason))); }); if (section.children.length === 1) section.appendChild(teacherNode("p", { class: "teacher-empty-inline" }, "Henüz yeterli veri yok.")); columns.appendChild(section); }); panel.appendChild(columns);
    }
    function addTeacherPanel() { var results = document.getElementById("results"); if (!results || document.getElementById("teacherDashboard")) return; var panel = teacherNode("section", { id: "teacherDashboard", class: "teacher-dashboard pro14-panel", "aria-labelledby": "teacherDashboardTitle" }); panel.appendChild(teacherNode("p", { class: "teacher-skeleton", "aria-label": "Öğretmen özeti yükleniyor" }, "Öğretmen özeti yükleniyor…")); results.insertBefore(panel, results.firstElementChild); }
    function loadTeacherSummary() { if (!canLoadTeacher()) return; var studentId = ""; try { studentId = localStorage.getItem("yasayan-defter-active-student") || ""; } catch (_) {} var suffix = studentId ? "?studentId=" + encodeURIComponent(studentId) : ""; fetch("/api/teacher/summary" + suffix, { headers: { "Accept": "application/json" } }).then(function (response) { return response.ok ? response.json() : null; }).then(function (payload) { var panel = document.getElementById("teacherDashboard"); if (!panel) return; if (payload?.summary) renderTeacherSummary(payload.summary); else panel.replaceChildren(teacherNode("p", { class: "teacher-empty-state" }, "Henüz yeterli öğrenme verisi yok. Öğrenci araştırma yaptıkça ve quiz çözdükçe bu panel gelişecektir.")); }).catch(function () { var panel = document.getElementById("teacherDashboard"); if (panel) panel.replaceChildren(teacherNode("p", { class: "teacher-error" }, "Öğretmen özeti şu anda yüklenemedi.")); }); }
    function addSmartSearch() {
        var input = document.getElementById("questionInput"); if (!input || document.getElementById("commercialSearchList")) return;
        var list = el("datalist", { id: "commercialSearchList" }); ["Yapay zeka", "Kuantum fiziği", "İklim değişikliği", "Mars", "DNA", "Osmanlı tarihi"].concat(state.recent).forEach(function (value) { list.appendChild(el("option", { value: value })); });
        input.setAttribute("list", "commercialSearchList"); input.insertAdjacentElement("afterend", list);
        var button = document.getElementById("searchButton"); if (button) button.addEventListener("click", function () { var value = input.value.trim(); if (!value) return; if (canLoadProgress()) { state.recent = [value].concat(state.recent.filter(function (x) { return x !== value; })).slice(0, 6); save(); } }, true);
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
    document.addEventListener("DOMContentLoaded", function () { addWorkspaceNavigation(); addProfilePanel(); addTeacherPanel(); addSmartSearch(); addQuizTracking(); addSettings(); addDemoMode(); loadLearningProgress(); loadTeacherSummary(); });
    window.addEventListener("yasayan-auth-ready", function () { renderProfile(); loadLearningProgress(); loadTeacherSummary(); });
    window.addEventListener("yasayan-profile-updated", function () { renderProfile(); });
    window.addEventListener("learning:updated", function () { loadLearningProgress(); loadTeacherSummary(); });
    window.addEventListener("student:updated", function () { loadLearningProgress(); loadTeacherSummary(); });
}());
