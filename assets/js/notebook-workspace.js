(function () {
  "use strict";

  var AREAS = { "": "Tümü", learning: "Öğrenme", work: "İş", research: "Araştırma", personal: "Kişisel", creative: "Üretim", daily_life: "Günlük Yaşam" };
  var root, rail, viewport, detail, detailReturn, observer, contextObserver, contextRequestedInNotebook = false;

  function el(tag, attrs, text) { var node = document.createElement(tag); Object.keys(attrs || {}).forEach(function (key) { if (key === "class") node.className = attrs[key]; else if (key === "hidden") node.hidden = true; else node.setAttribute(key, attrs[key]); }); if (text !== undefined) node.textContent = text; return node; }
  function authenticated() { return window.YasayanDefterAuth?.authenticated === true; }
  function heading(text) { return el("p", { class: "yd-notebook-rail-label" }, text); }

  function syncAreas() {
    var value = document.getElementById("smartNoteArea")?.value || "";
    root?.querySelectorAll("[data-notebook-area]").forEach(function (button) { var selected = button.dataset.notebookArea === value; button.setAttribute("aria-current", selected ? "page" : "false"); button.setAttribute("aria-pressed", String(selected)); });
  }

  function areaNav() {
    var nav = el("nav", { class: "yd-notebook-areas", "aria-label": "Defterim alanları" });
    Object.keys(AREAS).forEach(function (key) { var button = el("button", { type: "button", "data-notebook-area": key, "aria-pressed": key === "" ? "true" : "false" }, AREAS[key]); button.onclick = function () { var select = document.getElementById("smartNoteArea"); if (!select) return; select.value = key; select.dispatchEvent(new Event("change", { bubbles: true })); syncAreas(); }; nav.append(button); });
    return nav;
  }

  function arrangeTools() {
    var tools = document.getElementById("smartNoteTools"); if (!tools || tools.dataset.workspaceMounted || !root) return false; tools.dataset.workspaceMounted = "true";
    var actions = tools.querySelector(".smart-note-actions"), filters = tools.querySelector(".smart-note-filters"), chips = tools.querySelectorAll(".smart-note-chips"), presets = tools.querySelector(".smart-note-presets"), live = tools.querySelector("#smartNoteLive");
    var toolbar = el("div", { class: "yd-notebook-toolbar", role: "search", "aria-label": "Defterim arama ve filtreleri" });
    if (actions?.querySelector("#smartNoteSearch")) toolbar.append(actions.querySelector("#smartNoteSearch"));
    if (filters) toolbar.append(filters); viewport.prepend(toolbar);
    rail.append(heading("Alanlar"), areaNav());
    if (chips[0]) rail.append(heading("Hızlı Görünümler"), chips[0]);
    if (presets) rail.append(heading("Kaydedilmiş Görünümler"), presets);
    if (chips[1]) rail.append(heading("Hızlı Başlangıç"), chips[1]);
    if (live) viewport.append(live); tools.hidden = true; syncAreas();
    rail.addEventListener("click", function () { window.setTimeout(syncAreas, 0); }); return true;
  }

  function closeDetail() { if (!detail || detail.hidden) return; detail.hidden = true; root.classList.remove("has-detail"); detailReturn?.focus?.(); }
  function field(label, value) { var row = el("div", { class: "yd-notebook-detail-field" }); row.append(el("span", {}, label), el("strong", {}, value || "—")); return row; }

  async function loadRecord(title) {
    var params = new URLSearchParams({ archive: "all", sort: "updated", limit: "20", offset: "0", q: title });
    var response = await fetch("/api/memory/list?" + params); if (!response.ok) throw Error("DETAIL_LOAD_FAILED");
    var items = (await response.json()).memories || []; return items.find(function (item) { return item.title === title; }) || items[0] || null;
  }

  async function addRelated(item, host) {
    if (!authenticated() || !item?.id) return;
    try { var response = await fetch("/api/intelligence/context?recordId=" + encodeURIComponent(item.id)); if (!response.ok) return; var notes = (await response.json()).context?.relatedNotes || []; if (!notes.length) return; var section = el("section", { class: "yd-notebook-related", "aria-label": "Bağlantılı Notlar" }); section.append(el("h3", {}, "Bağlantılı Notlar")); notes.slice(0, 5).forEach(function (note) { var button = el("button", { type: "button", "data-related-id": note.id }, note.title); button.onclick = function () { closeDetail(); var search = document.getElementById("smartNoteSearch"); search.value = note.title; search.dispatchEvent(new Event("input", { bubbles: true })); search.focus(); }; section.append(button); }); host.append(section); } catch (_) {}
  }

  async function openDetail(title, trigger) {
    detailReturn = trigger; detail.hidden = false; root.classList.add("has-detail"); detail.replaceChildren(el("div", { class: "yd-notebook-detail-loading", role: "status" }, "Not hazırlanıyor…"));
    try {
      var item = await loadRecord(title); if (!item) throw Error("DETAIL_NOT_FOUND"); detail.replaceChildren();
      var head = el("header", { class: "yd-notebook-detail-head" }), close = el("button", { type: "button", "aria-label": "Not ayrıntısını kapat" }, "Kapat"); close.onclick = closeDetail;
      head.append(el("p", { class: "yd-notebook-eyebrow" }, item.contentType || "Araştırma"), el("h2", { tabindex: "-1" }, item.title || "Başlıksız"), close); detail.append(head);
      var body = el("div", { class: "yd-notebook-detail-body" }); body.append(el("p", { class: "yd-notebook-full-copy" }, item.summary || item.question || "Bu kayıt için önizleme bulunmuyor."));
      var meta = el("div", { class: "yd-notebook-detail-meta" }); meta.append(field("Alan", AREAS[item.workspaceArea] || item.workspaceArea), field("Tür", item.contentType), field("Güncellendi", item.updatedAt ? new Date(item.updatedAt).toLocaleString("tr-TR") : "—")); if (item.noteMetadata?.status) meta.append(field("Durum", item.noteMetadata.status)); if (item.noteMetadata?.date) meta.append(field("Tarih", item.noteMetadata.date)); body.append(meta);
      if (item.tags?.length) body.append(el("p", { class: "yd-notebook-detail-tags" }, item.tags.slice(0, 8).map(function (tag) { return "#" + tag; }).join(" ")));
      if (item.contentType !== "research") { var edit = el("button", { type: "button", class: "yd-notebook-detail-edit" }, "Düzenle"); edit.onclick = function () { closeDetail(); window.YDSmartNotes.open(item); }; body.append(edit); }
      detail.append(body); detail.querySelector("h2").focus(); addRelated(item, body);
    } catch (_) { detail.replaceChildren(el("p", { class: "smart-note-empty" }, "Not ayrıntısı şu anda açılamıyor.")); }
  }

  function enhanceCard(card) {
    if (card.dataset.workspaceEnhanced) return; card.dataset.workspaceEnhanced = "true"; card.setAttribute("tabindex", "0");
    var title = card.querySelector(".saved-title")?.textContent?.trim() || "Başlıksız";
    var menu = card.querySelector(".smart-note-menu");
    var preview = el("p", { class: "yd-notebook-preview" }, "Ayrıntılar ve bağlantılı notlar için kaydı aç."); var open = el("button", { type: "button", class: "yd-notebook-open", "aria-label": title + " kaydını aç" }, "Aç"); open.onclick = function () { openDetail(title, open); };
    card.insertBefore(preview, menu); card.insertBefore(open, menu); card.addEventListener("keydown", function (event) { if ((event.key === "Enter" || event.key === " ") && event.target === card) { event.preventDefault(); open.click(); } });
  }

  function enhanceAll() { document.querySelectorAll("#notebookList .smart-note-card").forEach(enhanceCard); syncAreas(); var more = document.getElementById("smartNoteMore"); if (more && more.parentNode !== viewport) viewport.append(more); }

  function build() {
    var section = document.getElementById("notebookSection"), list = document.getElementById("notebookList"); if (!section || !list || root) return;
    root = el("div", { id: "notebookWorkspace156", class: "yd-notebook-workspace" }); var header = el("header", { class: "yd-notebook-header" }), title = el("div", {}), create = el("button", { type: "button", class: "yd-notebook-create" }, "Yeni Not");
    title.append(el("p", { class: "yd-notebook-eyebrow" }, "PERSONAL WORKSPACE"), el("h2", { tabindex: "-1" }, "Defterim"), el("p", {}, "Notların, araştırmaların ve fikirlerin.")); create.onclick = function () { document.querySelector("#smartNoteTools .smart-note-primary")?.click(); }; header.append(title, create);
    var layout = el("div", { class: "yd-notebook-layout" }); rail = el("aside", { class: "yd-notebook-rail", "aria-label": "Defterim filtreleri" }); viewport = el("main", { class: "yd-notebook-viewport" }); detail = el("aside", { class: "yd-notebook-detail", "aria-label": "Not ayrıntısı", hidden: "" });
    list.parentNode.insertBefore(root, list); viewport.append(list); layout.append(rail, viewport, detail); root.append(header, layout); arrangeTools(); enhanceAll();
    observer = new MutationObserver(enhanceAll); observer.observe(list, { childList: true }); detail.addEventListener("keydown", function (event) { if (event.key === "Escape") closeDetail(); });
    contextObserver = new MutationObserver(function () { var panel = document.getElementById("researchContextPanel"); if (!authenticated() || !contextRequestedInNotebook || !panel || document.documentElement.dataset.shellPage !== "notebook" || detail.contains(panel)) return; contextRequestedInNotebook = false; detail.replaceChildren(panel); detail.hidden = false; root.classList.add("has-detail"); }); contextObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener("research:completed", function () { contextRequestedInNotebook = document.documentElement.dataset.shellPage === "notebook"; }); document.addEventListener("DOMContentLoaded", function () { build(); window.setTimeout(arrangeTools, 0); }); window.addEventListener("yasayan-auth-ready", function () { window.setTimeout(function () { build(); arrangeTools(); }, 0); });
  window.YDNotebookWorkspace = { build: build, enhanceCard: enhanceCard, closeDetail: closeDetail };
}());
