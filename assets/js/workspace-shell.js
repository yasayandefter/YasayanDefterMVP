(function () {
  "use strict";

  var pages = ["home", "research", "notebook", "collections", "personal", "profile"];
  var active = "home";
  var shell;
  var touchStart = null;
  var legacyObserver;

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "class") node.className = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    var icons = { home: "⌂", research: "⌕", notebook: "▤", collections: "▦", personal: "✦", profile: "○" };
    return icons[name] || "·";
  }

  function label(name) {
    return ({ home: "Ana Sayfa", research: "Araştır", notebook: "Defterim", collections: "Koleksiyonlar", personal: "Benim İçin", profile: "Profil" })[name];
  }

  function target(name) {
    return ({ research: "questionInput", notebook: "notebookSection", collections: "collectionsSection", profile: "commercialProfile" })[name];
  }

  function activate(name, focus) {
    if (!pages.includes(name) || !shell) return;
    active = name;
    document.documentElement.dataset.shellPage = name;
    shell.querySelectorAll("[data-shell-page]").forEach(function (button) {
      var selected = button.dataset.shellPage === name;
      button.setAttribute("aria-selected", String(selected));
      button.setAttribute("tabindex", selected ? "0" : "-1");
    });
    shell.querySelectorAll("[data-shell-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.shellPanel !== name;
    });
    var legacy = target(name) && document.getElementById(target(name));
    if (legacy) legacy.hidden = false;
    if (focus) (shell.querySelector('[data-shell-panel="' + name + '"] h1, [data-shell-panel="' + name + '"] h2') || legacy)?.focus?.({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    window.dispatchEvent(new CustomEvent("workspace-shell:navigate", { detail: { page: name } }));
  }

  function navButton(name) {
    var button = el("button", { type: "button", role: "tab", class: "yd-shell-nav-item", "data-shell-page": name, "aria-controls": "yd-panel-" + name });
    button.append(el("span", { class: "yd-shell-nav-icon", "aria-hidden": "true" }, icon(name)), el("span", {}, label(name)));
    button.addEventListener("click", function () { activate(name, true); });
    button.addEventListener("keydown", function (event) {
      if (!/ArrowLeft|ArrowRight|Home|End/.test(event.key)) return;
      event.preventDefault();
      var index = pages.indexOf(name);
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = pages.length - 1;
      else index = (index + (event.key === "ArrowRight" ? 1 : -1) + pages.length) % pages.length;
      activate(pages[index], false);
      shell.querySelector('[data-shell-page="' + pages[index] + '"]').focus();
    });
    return button;
  }

  function actionCard(name, copy) {
    var button = el("button", { type: "button", class: "yd-action-card", "data-action-page": name, "aria-label": label(name) + ": " + copy });
    button.append(el("span", { class: "yd-action-icon", "aria-hidden": "true" }, icon(name)), el("strong", {}, label(name)), el("small", {}, copy), el("span", { class: "yd-action-arrow", "aria-hidden": "true" }, "→"));
    button.addEventListener("click", function () { activate(name, true); });
    return button;
  }

  function homePanel(user) {
    var panel = el("section", { id: "yd-panel-home", class: "yd-shell-panel yd-home-panel", role: "tabpanel", "data-shell-panel": "home", "aria-labelledby": "yd-home-title" });
    var main = el("div", { class: "yd-home-main" });
    var intro = el("div", { class: "yd-home-intro" });
    var name = user && (user.displayName || user.username || user.email) || "";
    intro.append(el("p", { class: "yd-eyebrow" }, "KONTROL MERKEZİ"), el("h1", { id: "yd-home-title", tabindex: "-1" }, "Merhaba" + (name ? ", " + name : "")), el("p", { class: "yd-home-prompt" }, "Bugün ne üzerinde çalışmak istersin?"));
    var search = el("form", { class: "yd-home-search", role: "search", "aria-label": "Araştır" });
    var input = el("input", { type: "search", autocomplete: "off", placeholder: "Bir konu, fikir veya soru araştır…", "aria-label": "Araştırma konusu" });
    var submit = el("button", { type: "submit" }, "Araştır");
    search.append(el("span", { class: "yd-home-search-icon", "aria-hidden": "true" }, "⌕"), input, submit);
    search.addEventListener("submit", function (event) {
      event.preventDefault();
      var original = document.getElementById("questionInput");
      if (!original || !input.value.trim()) return;
      original.value = input.value.trim(); activate("research", false); document.getElementById("searchButton")?.click();
    });
    intro.append(search);
    var cards = el("div", { class: "yd-action-grid", "aria-label": "Ana çalışma alanları" });
    [["research", "Bilgiyi keşfet ve doğrula"], ["notebook", "Notlarına ve çalışmalarına dön"], ["collections", "Kayıtlarını bir araya getir"], ["personal", "Sana uygun önerileri gör"], ["profile", "Hesabını ve ilerlemeni yönet"]].forEach(function (item) { cards.append(actionCard(item[0], item[1])); });
    main.append(intro);
    var metrics = el("section", { class: "yd-metrics-rail", "aria-label": "Bugünün özeti" });
    metrics.append(el("p", { class: "yd-eyebrow" }, "BUGÜN"));
    [["commercialXp", "XP"], ["commercialProfileLevel", "Seviye"], ["commercialStreak", "Seri"], ["commercialGoalLabel", "Hedef"]].forEach(function (item) {
      var card = el("div", { class: "yd-metric", "data-metric-source": item[0] }); card.append(el("span", {}, item[1]), el("strong", {}, "—")); metrics.append(card);
    });
    var suggestions = el("div", { class: "yd-suggestions", "aria-label": "Hızlı öneriler" });
    ["Güncel araştırmalar", "Son notlar", "Aktif projeler", "Yeni fikir"].forEach(function (text) { var b = el("button", { type: "button" }, text); b.onclick = function () { activate(text === "Son notlar" || text === "Aktif projeler" || text === "Yeni fikir" ? "notebook" : "research", true); }; suggestions.append(b); });
    main.append(metrics, cards, suggestions);
    var intelligence = document.getElementById("workspaceHome");
    if (intelligence) main.append(intelligence);
    var empty = el("section", { class: "yd-home-empty", "aria-labelledby": "yd-home-empty-title" });
    var emptyCopy = el("div", {});
    emptyCopy.append(el("p", { class: "yd-eyebrow" }, "KALDIĞIN YER"), el("h2", { id: "yd-home-empty-title" }, "Henüz devam eden bir çalışma yok."), el("p", {}, "Bir araştırmaya veya nota başladığında burada görünecek."));
    var emptyAction = el("button", { type: "button", class: "yd-home-empty-action" }, "Yeni araştırma başlat");
    emptyAction.addEventListener("click", function () { activate("research", true); });
    empty.append(emptyCopy, emptyAction); main.append(empty);
    panel.append(main);
    return panel;
  }

  function simplePanel(name, title, copy) {
    var panel = el("section", { id: "yd-panel-" + name, class: "yd-shell-panel yd-route-panel", role: "tabpanel", "data-shell-panel": name, "aria-labelledby": "yd-" + name + "-title", hidden: "" });
    var head = el("header", { class: "yd-route-head" });
    head.append(el("p", { class: "yd-eyebrow" }, "YAŞAYAN DEFTER"), el("h1", { id: "yd-" + name + "-title", tabindex: "-1" }, title), el("p", {}, copy));
    panel.append(head);
    var mount = el("div", { class: "yd-legacy-mount", "data-mount": name }); panel.append(mount);
    return panel;
  }

  function mountLegacy() {
    var map = { research: [document.querySelector(".hero"), document.getElementById("loading"), document.getElementById("errorBox"), document.getElementById("results")], notebook: [document.getElementById("notebookSection")], collections: [document.getElementById("collectionsSection")], profile: [document.getElementById("commercialProfile")] };
    Object.keys(map).forEach(function (name) { var host = shell.querySelector('[data-mount="' + name + '"]'); map[name].filter(Boolean).forEach(function (node) { if (host && node.parentNode !== host) host.append(node); }); });
    var account = document.querySelector("[data-auth-user]:not(.auth-public-actions)");
    var secondary = shell.querySelector(".yd-shell-secondary");
    if (account && secondary && account.parentNode !== secondary) secondary.prepend(account);
  }

  function syncMetrics() {
    shell?.querySelectorAll("[data-metric-source]").forEach(function (card) {
      var source = document.getElementById(card.dataset.metricSource);
      var value = source?.textContent?.trim() || "—";
      var output = card.querySelector("strong");
      if (output.textContent !== value) output.textContent = value;
    });
  }

  function create(auth) {
    if (shell || auth?.authenticated !== true) return;
    document.documentElement.classList.add("yd-auth-shell");
    document.querySelector(".landing-header")?.setAttribute("hidden", "");
    document.querySelectorAll(".landing-main, .landing-footer, #landingFooter").forEach(function (node) { node.hidden = true; });
    var app = document.getElementById("brainEngineWorkspace"); if (!app) return;
    app.querySelector(".header")?.setAttribute("hidden", "");
    shell = el("div", { id: "workspaceShell156", class: "yd-shell" });
    var top = el("header", { class: "yd-shell-top" });
    var brand = el("button", { type: "button", class: "yd-shell-brand", "aria-label": "Ana sayfaya dön" }); brand.append(el("span", { "aria-hidden": "true" }, "YD"), el("strong", {}, "Yaşayan Defter")); brand.onclick = function () { activate("home", true); };
    var secondary = el("div", { class: "yd-shell-secondary" });
    if (auth.user?.role === "TEACHER") {
      var teacher = el("button", { type: "button", class: "yd-shell-settings", "data-shell-teacher": "", "aria-label": "Öğretmen araçlarını aç" }, "Öğretmen Araçları");
      teacher.onclick = function () { activate("profile", false); var panel = document.getElementById("teacherDashboard"); if (panel) { shell.querySelector('[data-mount="profile"]')?.append(panel); panel.hidden = false; panel.scrollIntoView({ behavior: "smooth", block: "start" }); } };
      secondary.append(teacher);
    }
    var settings = el("button", { type: "button", class: "yd-shell-settings", "aria-label": "Ayarları aç" }, "Ayarlar"); settings.onclick = function () { document.querySelector('#commercialNav [data-target="commercialSettings"]')?.click(); };
    secondary.append(settings); top.append(brand, secondary);
    var nav = el("nav", { class: "yd-shell-nav", role: "tablist", "aria-label": "Ana çalışma alanları" }); pages.forEach(function (name) { nav.append(navButton(name)); });
    var viewport = el("main", { class: "yd-shell-viewport", "aria-live": "off" });
    viewport.append(homePanel(auth.user), simplePanel("research", "Araştır", "Bir konuyu keşfet, kaynakları incele ve sonuçlarını defterine taşı."), simplePanel("notebook", "Defterim", "Notların, projelerin ve fikirlerin tek çalışma alanında."), simplePanel("collections", "Koleksiyonlar", "İlgili kayıtları anlamlı gruplar halinde düzenle."), simplePanel("personal", "Benim İçin", "Çalışma alanlarına ve son etkinliklerine göre seçilen kısa yollar."), simplePanel("profile", "Profil", "Hesap, tercihler ve ikincil öğrenme metrikleri."));
    shell.append(top, nav, viewport); app.prepend(shell); mountLegacy();
    var personal = shell.querySelector('[data-mount="personal"]'); personal.append(el("div", { class: "yd-personal-copy" }, "Öneriler ve devam ettiğin çalışmalar ana sayfadaki kompakt akışta güncellenir."));
    var observer = new MutationObserver(syncMetrics); observer.observe(shell, { subtree: true, childList: true, characterData: true });
    legacyObserver = new MutationObserver(mountLegacy);
    legacyObserver.observe(app, { childList: true, subtree: true });
    syncMetrics(); activate("home", false);
    viewport.addEventListener("pointerdown", function (event) { if (event.pointerType === "touch" && !event.target.closest("input,textarea,select,button,a,[contenteditable]")) touchStart = { x: event.clientX, y: event.clientY }; });
    viewport.addEventListener("pointerup", function (event) { if (!touchStart) return; var dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y; touchStart = null; if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.35) return; var index = pages.indexOf(active); activate(pages[(index + (dx < 0 ? 1 : -1) + pages.length) % pages.length], true); });
  }

  window.addEventListener("yasayan-auth-ready", function (event) { if (event.detail?.authenticated) window.setTimeout(function () { create(event.detail); }, 0); });
  document.addEventListener("DOMContentLoaded", function () { if (window.YasayanDefterAuth?.authenticated) create(window.YasayanDefterAuth); });
  window.YDWorkspaceShell = { activate: activate, pages: pages.slice() };
}());
