(function () {
  "use strict";

  var root, viewport, observer;
  function el(tag, attrs, text) { var node = document.createElement(tag); Object.keys(attrs || {}).forEach(function (key) { if (key === "class") node.className = attrs[key]; else node.setAttribute(key, attrs[key]); }); if (text !== undefined) node.textContent = text; return node; }

  function setView(mode, focus) {
    if (!root) return; root.dataset.collectionView = mode; root.querySelectorAll("[data-collection-view]").forEach(function (button) { var active = button.dataset.collectionView === mode; button.setAttribute("aria-pressed", String(active)); button.classList.toggle("is-active", active); }); if (focus) document.getElementById("collectionCards")?.focus();
  }

  function enhanceCard(card, index) {
    if (card.dataset.workspaceEnhanced) return; card.dataset.workspaceEnhanced = "true"; card.setAttribute("tabindex", "0"); card.style.setProperty("--collection-index", index % 4);
    var name = card.querySelector("strong")?.textContent?.trim() || "Koleksiyon";
    var cover = el("div", { class: "yd-collection-cover", "aria-hidden": "true" }); cover.append(el("span", {}, name.slice(0, 1).toLocaleUpperCase("tr-TR")), el("i", {})); card.prepend(cover);
    var open = card.querySelector("button"); if (open) { open.classList.add("yd-collection-open"); open.textContent = "Koleksiyonu Aç"; }
    card.addEventListener("keydown", function (event) { if ((event.key === "Enter" || event.key === " ") && event.target === card) { event.preventDefault(); open?.click(); } });
  }

  function enhanceAll() {
    document.querySelectorAll("#collectionCards .collection-card").forEach(enhanceCard);
    var empty = document.querySelector("#collectionCards > p"); if (empty && !empty.dataset.enhanced) { empty.dataset.enhanced = "true"; empty.className = "yd-collections-empty"; if (/Henüz/.test(empty.textContent || "")) { var button = el("button", { type: "button" }, "İlk Koleksiyonunu Oluştur"); button.onclick = function () { window.YDSmartCollections?.openCreate({}); }; empty.append(button); } }
  }

  function enhanceDialog(dialog) {
    if (!dialog || dialog.dataset.workspaceEnhanced) return; dialog.dataset.workspaceEnhanced = "true"; dialog.classList.add("yd-collection-sheet");
    if (dialog.id === "collectionDetailDialog") { var form = dialog.querySelector("form"); if (form) form.setAttribute("aria-label", "Koleksiyon ayrıntısı ve üyeleri"); }
  }

  function build() {
    var section = document.getElementById("collectionsSection"), cards = document.getElementById("collectionCards"), toolbar = section?.querySelector(".collections-toolbar"); if (!section || !cards || root) return;
    root = el("div", { id: "collectionsWorkspace156", class: "yd-collections-workspace", "data-collection-view": "grid" });
    var header = el("header", { class: "yd-collections-header" }), copy = el("div", {}), create = toolbar?.querySelector("button");
    copy.append(el("p", { class: "yd-collections-eyebrow" }, "PERSONAL ARCHIVE"), el("h2", { tabindex: "-1" }, "Koleksiyonlar"), el("p", {}, "Notlarını, araştırmalarını ve içeriklerini bir arada tut."));
    if (create) { create.classList.add("yd-collections-create"); create.textContent = "Yeni Koleksiyon"; }
    header.append(copy); if (create) header.append(create);
    var controls = el("div", { class: "yd-collections-controls" }), search = toolbar?.querySelector("#collectionSearch"), sort = toolbar?.querySelector("#collectionSort"), views = el("div", { class: "yd-collection-views", role: "group", "aria-label": "Koleksiyon görünümü" });
    [["grid", "Izgara"], ["list", "Liste"]].forEach(function (item) { var button = el("button", { type: "button", "data-collection-view": item[0], "aria-pressed": item[0] === "grid" ? "true" : "false" }, item[1]); button.onclick = function () { setView(item[0], true); }; views.append(button); });
    if (search) controls.append(search); if (sort) controls.append(sort); controls.append(views);
    viewport = el("main", { class: "yd-collections-viewport", "aria-label": "Koleksiyon galerisi" }); cards.setAttribute("tabindex", "-1"); viewport.append(cards, section.querySelector("#collectionLive")); root.append(header, controls, viewport); section.append(root); toolbar?.remove(); section.querySelector(":scope > h2")?.remove();
    observer = new MutationObserver(enhanceAll); observer.observe(cards, { childList: true }); new MutationObserver(function (records) { records.forEach(function (record) { record.addedNodes.forEach(function (node) { if (node.nodeType === 1 && node.matches?.(".collection-dialog")) enhanceDialog(node); }); }); }).observe(document.body, { childList: true }); enhanceAll();
  }

  document.addEventListener("DOMContentLoaded", function () { window.setTimeout(build, 0); }); window.addEventListener("yasayan-auth-ready", function () { window.setTimeout(build, 0); });
  window.YDCollectionsWorkspace = { build: build, setView: setView, enhanceCard: enhanceCard };
}());
