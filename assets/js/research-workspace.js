(function () {
  "use strict";

  var definitions = [
    { id: "overview", label: "Genel Bakış", markers: ["topicTitle", "professionalResult", "analysisType", "progressPercent", "summaryText", "teacherSimple", "voiceStatus", "factsContainer", "interestingText", "followContainer", "relatedContainer", "researchStats"] },
    { id: "visuals", label: "Görseller", markers: ["imagesContainer"] },
    { id: "sources", label: "Kaynaklar", markers: ["sourcesContainer"] },
    { id: "quiz", label: "Quiz", markers: ["quizQuestion", "quizPro"] },
    { id: "map", label: "Zihin Haritası", markers: ["knowledgeMap"] },
    { id: "memory", label: "Hafıza", markers: ["memoryContainer", "flashcardsContainer", "notebookSection", "researchContextPanel"] }
  ];
  var root;
  var tabs;
  var panels = {};
  var active = "overview";
  var observer;
  var stateObserver;
  var overviewOwners = ["visuals", "quiz"];

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "class") node.className = attrs[key];
      else if (key === "hidden") node.hidden = true;
      else node.setAttribute(key, attrs[key]);
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function sectionFor(marker) {
    var node = document.getElementById(marker);
    return node && (node.matches("section") ? node : node.closest("section"));
  }

  function definitionFor(section) {
    return definitions.find(function (definition) {
      return definition.markers.some(function (marker) {
        var node = document.getElementById(marker);
        return node && (node === section || section.contains(node));
      });
    }) || definitions[0];
  }

  function titleText() {
    return document.querySelector("#professionalResult .professional-result-title")?.textContent?.trim() || document.getElementById("topicTitle")?.textContent?.trim() || "Araştırma sonucu";
  }

  function syncHeader() {
    if (!root) return;
    var title = root.querySelector("[data-research-title]");
    if (title.textContent !== titleText()) title.textContent = titleText();
    var category = document.getElementById("topicCategory")?.textContent?.trim() || "Araştırma";
    var sources = document.getElementById("heroSources")?.textContent?.trim();
    var context = root.querySelector("[data-research-context]");
    var contextText = category + (sources && sources !== "0" ? " · " + sources + " kaynak" : " · kaynaklı çalışma alanı");
    if (context.textContent !== contextText) context.textContent = contextText;
    var original = document.getElementById("saveTopicButton");
    var proxy = root.querySelector("[data-research-save]");
    if (original && proxy) {
      var saveText = original.textContent?.trim() || "Defterime Kaydet";
      if (proxy.textContent !== saveText) proxy.textContent = saveText;
      proxy.classList.toggle("is-saved", original.classList.contains("saved"));
    }
  }

  function panelHasContent(id) {
    var panel = panels[id];
    if (!panel) return false;
    var owned = root?.querySelectorAll('[data-research-owner="' + id + '"]') || [];
    if (id === "overview" || id === "visuals" || id === "sources" || id === "quiz" || id === "memory") return owned.length > 0;
    return Array.from(panel.querySelectorAll("#knowledgeMap > *, #knowledgeMap [class]")).length > 0 || Boolean(document.getElementById("knowledgeMap")?.textContent?.trim());
  }

  function placeSections() {
    if (!root) return;
    root.querySelectorAll("[data-research-owner]").forEach(function (section) {
      var owner = section.dataset.researchOwner;
      var destination = active === "overview" && overviewOwners.includes(owner) ? panels.overview : panels[owner];
      if (destination && section.parentNode !== destination) destination.append(section);
    });
    var banner = document.getElementById("livingMemoryResultBanner");
    if (banner && banner.parentNode !== panels.overview) panels.overview.append(banner);
  }

  function syncAvailability() {
    var currentEmpty = document.getElementById("results")?.classList.contains("current-empty-results");
    root?.classList.toggle("is-current-empty", Boolean(currentEmpty));
    definitions.forEach(function (definition) {
      var button = tabs?.querySelector('[data-research-tab="' + definition.id + '"]');
      if (!button) return;
      var available = (!currentEmpty || definition.id === "overview") && panelHasContent(definition.id);
      if (button.hidden === available) button.hidden = !available;
      if (!available && active === definition.id) activate("overview", false);
    });
  }

  function activate(id, focus) {
    var button = tabs?.querySelector('[data-research-tab="' + id + '"]:not([hidden])');
    if (!button || !panels[id]) return;
    active = id;
    placeSections();
    tabs.querySelectorAll("[data-research-tab]").forEach(function (tab) {
      var selected = tab === button;
      tab.setAttribute("aria-selected", String(selected));
      tab.setAttribute("tabindex", selected ? "0" : "-1");
    });
    Object.keys(panels).forEach(function (key) { panels[key].hidden = key !== id; });
    root.dataset.activeResearchPanel = id;
    if (focus) button.focus();
    root.dispatchEvent(new CustomEvent("research-workspace:change", { detail: { panel: id } }));
  }

  function tabButton(definition) {
    var button = el("button", {
      type: "button", role: "tab", class: "yd-research-tab", id: "yd-research-tab-" + definition.id,
      "data-research-tab": definition.id, "aria-controls": "yd-research-panel-" + definition.id,
      "aria-selected": definition.id === active ? "true" : "false", tabindex: definition.id === active ? "0" : "-1"
    }, definition.label);
    button.addEventListener("click", function () { activate(definition.id, false); });
    button.addEventListener("keydown", function (event) {
      if (!/ArrowLeft|ArrowRight|Home|End|Enter| /.test(event.key)) return;
      event.preventDefault();
      if (event.key === "Enter" || event.key === " ") { activate(definition.id, true); return; }
      var available = Array.from(tabs.querySelectorAll("[data-research-tab]:not([hidden])"));
      var index = available.indexOf(button);
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = available.length - 1;
      else index = (index + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length;
      activate(available[index].dataset.researchTab, true);
    });
    return button;
  }

  function moveSections(results) {
    Array.from(results.children).forEach(function (section) {
      if (section === root || !section.matches("section, [data-research-section]")) return;
      var owner = definitionFor(section).id;
      section.dataset.researchOwner = owner;
      var destination = active === "overview" && overviewOwners.includes(owner) ? panels.overview : panels[owner];
      destination.append(section);
    });
    placeSections();
  }

  function build() {
    var results = document.getElementById("results");
    if (!results || root) return;
    root = el("div", { id: "researchWorkspace156", class: "yd-research-workspace", "data-active-research-panel": active });
    var header = el("header", { class: "yd-research-header" });
    var heading = el("div", { class: "yd-research-heading" });
    heading.append(el("p", { class: "yd-research-eyebrow" }, "RESEARCH WORKSPACE"), el("h2", { "data-research-title": "", tabindex: "-1" }, titleText()), el("p", { "data-research-context": "", class: "yd-research-context" }, "Kaynaklı çalışma alanı"));
    var save = el("button", { type: "button", class: "yd-research-save", "data-research-save": "" }, "Defterime Kaydet");
    save.addEventListener("click", function () { document.getElementById("saveTopicButton")?.click(); });
    header.append(heading, save);
    tabs = el("div", { class: "yd-research-tabs", role: "tablist", "aria-label": "Araştırma sonucu bölümleri" });
    var content = el("div", { class: "yd-research-panels" });
    definitions.forEach(function (definition) {
      tabs.append(tabButton(definition));
      panels[definition.id] = el("section", {
        id: "yd-research-panel-" + definition.id, class: "yd-research-panel yd-research-panel-" + definition.id,
        role: "tabpanel", "aria-labelledby": "yd-research-tab-" + definition.id,
        tabindex: "0", hidden: definition.id === active ? undefined : ""
      });
      content.append(panels[definition.id]);
    });
    root.append(header, tabs, content);
    results.prepend(root);
    moveSections(results);
    syncHeader(); syncAvailability(); activate("overview", false);
    observer = new MutationObserver(function () { moveSections(results); syncHeader(); syncAvailability(); var login = document.getElementById("researchContextPanel"); if (login?.classList.contains("context-login")) document.querySelector(".hero-search")?.insertAdjacentElement("afterend", login); });
    observer.observe(results, { subtree: true, childList: true, characterData: true });
    stateObserver = new MutationObserver(syncAvailability);
    stateObserver.observe(results, { attributes: true, attributeFilter: ["class"] });
  }

  document.addEventListener("DOMContentLoaded", build);
  window.addEventListener("research:completed", function () {
    activate("overview", false);
  });
  window.YDResearchWorkspace = { activate: activate, build: build, tabs: definitions.map(function (item) { return item.id; }) };
}());
