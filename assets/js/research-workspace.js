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
  var overviewOwners = [];

  // Decorative UI glyphs only; result content still comes from the existing renderer.
  function glyph(name) {
    var paths = {
      overview: "M12 5C8 2 3 3 2 4v15c3-2 7-2 10 0 3-2 7-2 10 0V4c-3-2-7-2-10 1v14",
      visuals: "M3 3h18v18H3z M3 16l6-6 5 5 3-3 4 4 M16 7h.01",
      sources: "M5 2h10l4 4v16H5z M15 2v5h4 M8 11h8 M8 15h8 M8 18h5",
      quiz: "M9 3C4 3 3 8 5 10c-4 3-2 8 2 8 0 3 5 4 5 0V6c0-3-3-4-3-3 M15 3c5 0 6 5 4 7 4 3 2 8-2 8 0 3-5 4-5 0 M7 8h3 M14 12h4",
      map: "M8 6l8 5 M8 18l8-5 M4 3h5v5H4z M16 9h5v6h-5z M4 16h5v5H4z",
      memory: "M3 5c0-4 18-4 18 0s-18 4-18 0v14c0 4 18 4 18 0V5 M3 12c0 4 18 4 18 0",
      category: "M2 6h8l2 3h10v12H2z M2 6V3h8l2 3h8v3",
      facts: "M8 17c0-3-4-4-4-9a8 8 0 0116 0c0 5-4 6-4 9 M8 18h8 M9 21h6",
      progress: "M3 15h3v6H3z M10 9h3v12h-3z M17 3h3v18h-3z"
    };
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "yd-research-glyph"); svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", paths[name] || paths.overview); svg.append(path); return svg;
  }

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

  function syncHeader() {
    if (!root) return;
    var original = document.getElementById("saveTopicButton");
    var proxy = root.querySelector("[data-research-save]");
    if (original && proxy) {
      var saveText = original.classList.contains("saved") ? "Defterime kaydedildi" : "Defterime kaydet";
      if (proxy.textContent !== saveText) proxy.textContent = saveText;
      proxy.classList.toggle("is-saved", original.classList.contains("saved"));
      var topic = document.querySelector("#yd-research-panel-overview .topic-header");
      if (topic && proxy.parentNode !== topic) topic.append(proxy);
    }
    syncTopicImage();
    ["heroCategory", "heroSources", "heroImages", "heroFacts"].forEach(function (id, index) {
      var chip = document.getElementById(id)?.parentElement;
      if (chip && !chip.querySelector("svg")) chip.prepend(glyph(["category", "sources", "visuals", "facts"][index]));
    });
    syncOverviewLayers();
  }

  function syncTopicImage() {
    var image = document.querySelector("#topicImageBox img");
    var box = document.getElementById("topicImageBox");
    if (!image || !box) return;
    function classify() {
      if (!image.naturalWidth || !image.naturalHeight) return;
      var ratio = image.naturalWidth / image.naturalHeight;
      box.dataset.mediaShape = ratio < .88 ? "portrait" : ratio > 1.35 ? "landscape" : "balanced";
    }
    classify();
    if (!image.dataset.ydCompositionBound) {
      image.dataset.ydCompositionBound = "true";
      image.addEventListener("load", classify, { once: true });
    }
  }

  function panelHasContent(id) {
    var panel = panels[id];
    if (!panel) return false;
    var owned = root?.querySelectorAll('[data-research-owner="' + id + '"]') || [];
    if (id === "overview" || id === "visuals" || id === "sources" || id === "quiz" || id === "memory") return owned.length > 0;
    return Array.from(panel.querySelectorAll("#knowledgeMap > *, #knowledgeMap [class]")).length > 0 || Boolean(document.getElementById("knowledgeMap")?.textContent?.trim());
  }

  function meaningfulText(node) {
    var value = node?.textContent?.replace(/\s+/g, " ").trim() || "";
    return value && value !== "—" ? value : "";
  }

  function syncOverviewLayers() {
    if (!root) return;
    var follow = document.getElementById("followContainer");
    if (follow) {
      follow.classList.remove("yd-horizontal-rail");
      follow.closest(".section")?.querySelectorAll(".yd-rail-controls").forEach(function (node) { node.remove(); });
    }
    var discovery = root.querySelector("[data-overview-discovery]");
    var preview = discovery?.querySelector("[data-discovery-images]");
    var sourceImages = Array.from(document.querySelectorAll("#imagesContainer .image-card img")).filter(function (image) { return image.src && !image.hidden; }).slice(0, 4);
    if (preview) {
      var signature = sourceImages.map(function (image) { return image.currentSrc || image.src; }).join("|");
      if (preview.dataset.signature !== signature) {
        preview.dataset.signature = signature;
        preview.replaceChildren();
        sourceImages.forEach(function (source) {
          var image = el("img", { src: source.currentSrc || source.src, alt: source.alt || "Araştırma görseli", loading: "eager", role: "button", tabindex: "0", "aria-label": (source.alt || "Araştırma görseli") + " — Görselleri aç" });
          var frame = el("figure", { class: "yd-discovery-frame" });
          var caption = el("figcaption", {}, (source.alt || "").replace(/\.(?:jpe?g|png|webp|gif)$/i, "").replace(/[_-]+/g, " "));
          frame.append(image, caption);
          function classifyPreview() {
            if (!image.naturalWidth || !image.naturalHeight) return;
            var ratio = image.naturalWidth / image.naturalHeight;
            image.dataset.mediaShape = ratio < .86 ? "portrait" : ratio > 1.35 ? "landscape" : "balanced";
            frame.dataset.mediaShape = image.dataset.mediaShape;
            // Give a real landscape image the large editorial opening when available.
            var lead = Array.from(preview.children).find(function (item) { return item.dataset.mediaShape === "landscape"; });
            if (lead && preview.firstElementChild !== lead) preview.prepend(lead);
          }
          classifyPreview();
          image.addEventListener("load", classifyPreview, { once: true });
          image.addEventListener("click", function () { activate("visuals", false); });
          image.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate("visuals", true); } });
          preview.append(frame);
        });
      }
      discovery.hidden = sourceImages.length === 0;
      root.classList.toggle("has-discovery", sourceImages.length > 0);
    }
    var insight = discovery?.querySelector("[data-discovery-insight]");
    var insightText = ["#interestingText", "#factsContainer .fact p", "#factsContainer .fact", "#relatedContainer button"].map(function (selector) { return meaningfulText(document.querySelector(selector)); }).find(Boolean) || "";
    if (insight) {
      if (insight.textContent !== insightText) insight.textContent = insightText;
      insight.parentElement.hidden = !insightText;
    }

    var percent = meaningfulText(document.getElementById("progressPercent"));
    var overviewPercent = root.querySelector("[data-overview-progress]");
    if (overviewPercent && overviewPercent.textContent !== percent) overviewPercent.textContent = percent;
    var originalFill = document.getElementById("progressFill");
    var overviewFill = root.querySelector("[data-overview-progress-fill]");
    if (overviewFill) overviewFill.style.width = originalFill?.style.width || percent || "0%";
  }

  function buildOverviewLayers() {
    var discovery = el("section", { class: "yd-overview-discovery", "data-overview-discovery": "" });
    var discoveryHead = el("div", { class: "yd-overview-layer-head" });
    discoveryHead.append(el("h3", {}, "Keşfet"));
    var openVisuals = el("button", { type: "button", class: "yd-overview-link" }, "Tüm görselleri aç →");
    openVisuals.addEventListener("click", function () { activate("visuals", true); });
    discoveryHead.append(openVisuals);
    var discoveryBody = el("div", { class: "yd-discovery-body" });
    var preview = el("div", { class: "yd-discovery-images", "data-discovery-images": "" });
    var insight = el("aside", { class: "yd-discovery-insight" });
    insight.append(el("span", {}, "Bu konuda"), el("p", { "data-discovery-insight": "" }));
    discoveryBody.append(preview, insight); discovery.append(discoveryHead, discoveryBody);

    var learning = el("section", { class: "yd-overview-learning" });
    learning.append(el("h3", {}, "Öğrenmeye Devam Et"));
    var items = el("div", { class: "yd-learning-continuations" });
    var quiz = el("div", { class: "yd-learning-continuation" });
    quiz.append(el("span", {}, "Quiz"), el("p", {}, "Kendini test et"));
    var openQuiz = el("button", { type: "button" }, "Quiz'i aç →"); openQuiz.addEventListener("click", function () { activate("quiz", true); }); quiz.append(openQuiz);
    var progress = el("div", { class: "yd-learning-continuation yd-learning-progress" });
    progress.append(el("span", {}, "İlerleme"), el("strong", { "data-overview-progress": "" }, "0%"));
    var track = el("div", { class: "yd-overview-progress-track" }); track.append(el("i", { "data-overview-progress-fill": "" })); progress.append(track);
    var notebook = el("div", { class: "yd-learning-continuation" });
    notebook.append(el("span", {}, "Defter"), el("p", {}, "Bu konuyu daha sonra çalış"));
    var save = el("button", { type: "button" }, "Defterime kaydet"); save.addEventListener("click", function () { document.getElementById("saveTopicButton")?.click(); }); notebook.append(save);
    items.append(quiz, progress, notebook); learning.append(items);
    [quiz, progress, notebook].forEach(function (item, index) { var badge = el("span", { class: "yd-learning-icon", "aria-hidden": "true" }); badge.append(glyph(["quiz", "progress", "overview"][index])); item.prepend(badge); });
    panels.overview.append(discovery, learning);
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
    button.prepend(glyph(definition.id));
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
    var save = el("button", { type: "button", class: "yd-research-save", "data-research-save": "" }, "Defterime Kaydet");
    save.addEventListener("click", function () { document.getElementById("saveTopicButton")?.click(); });
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
    buildOverviewLayers();
    root.append(save, tabs, content);
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
    window.YDWorkspaceShell?.activate("research", false);
    activate("overview", false);
  });
  window.YDResearchWorkspace = { activate: activate, build: build, tabs: definitions.map(function (item) { return item.id; }) };
}());
