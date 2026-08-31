(function () {
  "use strict";

  var AREAS = { "": "Alan yok", learning: "Öğrenme", work: "İş", research: "Araştırma", personal: "Kişisel", creative: "Üretim", daily_life: "Günlük Yaşam" };
  var returnFocus, lastSuggestion;

  function el(tag, attrs, text) { var node = document.createElement(tag); Object.keys(attrs || {}).forEach(function (key) { if (key === "class") node.className = attrs[key]; else node.setAttribute(key, attrs[key]); }); if (text !== undefined) node.textContent = text; return node; }
  function auth() { return window.YasayanDefterAuth?.authenticated === true; }
  function announce(text) { var node = document.getElementById("collectionLive"); if (node) node.textContent = text; }
  async function api(path, options) { var response = await fetch(path, options); var body = await response.json().catch(function () { return {}; }); if (!response.ok) { var error = new Error(body.error?.message || "İşlem tamamlanamadı."); error.code = body.error?.code; throw error; } return body; }
  function field(text, tag, attrs) { var label = el("label", {}, text), control = el(tag, attrs); label.append(control); return { label: label, control: control }; }

  function section() {
    if (document.getElementById("collectionsSection")) return;
    var notebook = document.getElementById("notebookSection"); if (!notebook) return;
    var sectionNode = el("section", { id: "collectionsSection", class: "collections-section", "aria-labelledby": "collectionsTitle" });
    var bar = el("div", { class: "collections-toolbar" });
    var create = el("button", { type: "button" }, "Yeni Koleksiyon");
    var search = el("input", { id: "collectionSearch", type: "search", maxlength: "80", placeholder: "Koleksiyon ara", "aria-label": "Koleksiyon ara" });
    var sort = el("select", { id: "collectionSort", "aria-label": "Koleksiyon sıralama" });
    [["updated", "Son güncellenen"], ["name", "Ad A–Z"], ["count", "İçerik sayısı"]].forEach(function (item) { sort.append(el("option", { value: item[0] }, item[1])); });
    create.onclick = function () { openCreate({}); }; search.oninput = load; sort.onchange = load; bar.append(create, search, sort);
    sectionNode.append(el("h2", { id: "collectionsTitle" }, "Koleksiyonlar"), bar, el("div", { id: "collectionCards", class: "collection-cards" }), el("p", { id: "collectionLive", class: "collection-status", role: "status", "aria-live": "polite" }));
    notebook.insertAdjacentElement("afterend", sectionNode); refresh();
  }

  function refresh() { var node = document.getElementById("collectionsSection"); if (node) node.hidden = !auth(); if (auth()) load(); }
  async function load() {
    if (!auth()) return;
    var box = document.getElementById("collectionCards"); if (!box) return;
    box.setAttribute("aria-busy", "true"); announce("Koleksiyonlar yükleniyor.");
    try {
      var query = document.getElementById("collectionSearch")?.value || "", sort = document.getElementById("collectionSort")?.value || "updated";
      var data = await api("/api/collections?q=" + encodeURIComponent(query) + "&sort=" + sort); box.replaceChildren();
      if (!data.collections.length) box.append(el("p", {}, query ? "Aramana uygun koleksiyon bulunamadı." : "Henüz koleksiyonun yok."));
      data.collections.forEach(function (collection) {
        var card = el("article", { class: "collection-card" }), open = el("button", { type: "button", "aria-label": collection.name + " koleksiyonunu aç" }, "Aç");
        open.onclick = function () { openDetail(collection.id); };
        card.append(el("strong", {}, collection.name), el("span", {}, collection.itemCount + " içerik · " + collection.recordCount + " not · " + collection.mediaCount + " medya · " + (AREAS[collection.workspaceArea] || "Alan yok")), open); box.append(card);
      });
      announce(data.collections.length + " koleksiyon gösteriliyor.");
    } catch (error) { announce(error.message || "Koleksiyonlar yüklenemedi."); }
    finally { box.removeAttribute("aria-busy"); }
  }

  function dialog(id, title) {
    document.getElementById(id)?.remove(); var dialogNode = el("dialog", { id: id, class: "collection-dialog", "aria-labelledby": id + "Title" }), form = el("form", { class: "collection-form", method: "dialog" });
    form.append(el("h2", { id: id + "Title" }, title)); dialogNode.append(form); dialogNode.onclose = function () { returnFocus?.focus(); dialogNode.remove(); }; dialogNode.oncancel = function (event) { event.preventDefault(); dialogNode.close(); }; dialogNode.addEventListener("keydown", trap); document.body.append(dialogNode); return { d: dialogNode, form: form };
  }

  async function openCreate(seed) {
    seed = seed || {}; if (!auth()) { document.querySelector("[data-open-login]")?.focus(); return; }
    returnFocus = document.activeElement; lastSuggestion = seed.contextRecordId ? seed : null;
    var view = dialog("collectionCreateDialog", "Koleksiyon Oluştur"), name = field("Ad", "input", { maxlength: "80", required: "" }), description = field("Açıklama (opsiyonel)", "textarea", { maxlength: "1000" }), area = field("Alan (opsiyonel)", "select", {}), members = el("div", { class: "collection-member-options", "aria-label": "Koleksiyon üyeleri" }), status = el("p", { class: "collection-status", role: "status", "aria-live": "polite" }), buttons = el("div", { class: "collection-form-actions" }), cancel = el("button", { type: "button" }, "Vazgeç"), save = el("button", { type: "submit" }, "Koleksiyonu Kaydet");
    Object.entries(AREAS).forEach(function (entry) { area.control.append(el("option", { value: entry[0] }, entry[1])); }); name.control.value = seed.suggestedName || ""; area.control.value = seed.suggestedArea || "";
    try { var data = await api("/api/memory/list?archive=active&limit=50"); data.memories.forEach(function (memory) { var label = el("label", {}), check = el("input", { type: "checkbox", value: memory.id }); check.checked = (seed.recordIds || []).includes(memory.id); label.append(check, document.createTextNode(memory.title)); members.append(label); }); } catch (_) { status.textContent = "Kayıtlar yüklenemedi."; }
    cancel.onclick = function () { view.d.close(); }; buttons.append(cancel, save); view.form.append(name.label, description.label, area.label, el("strong", {}, "Üyeler — en az 2"), members, status, buttons);
    view.form.onsubmit = async function (event) { event.preventDefault(); var recordIds = [...members.querySelectorAll("input:checked")].map(function (input) { return input.value; }); if (recordIds.length < 2) { status.textContent = "En az 2 kayıt seç."; return; } try { var result = await api("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.control.value, description: description.control.value, workspaceArea: area.control.value || null, recordIds: recordIds }) }); announce(result.duplicateWarning ? "Benzer adlı bir koleksiyonun zaten var." : "Koleksiyon oluşturuldu."); if (lastSuggestion?.contextRecordId) feedback("collection", result.collection.id, "helpful", lastSuggestion.contextRecordId); view.d.close(); load(); } catch (error) { status.textContent = error.message || "Koleksiyon oluşturulamadı."; } };
    view.d.showModal(); name.control.focus();
  }

  function renderNote(member, collectionId, host, status) {
    var card = el("article", { class: "collection-member yd-collection-content-card", tabindex: "0" }), type = el("span", { class: "yd-content-kind" }, member.contentType || "NOT"), title = el("strong", {}, member.title), remove = el("button", { type: "button", "aria-label": member.title + " kaydını koleksiyondan çıkar" }, "Koleksiyondan Çıkar");
    remove.onclick = async function () { try { await api("/api/collections/" + collectionId + "/items/" + member.id, { method: "DELETE" }); card.remove(); status.textContent = "Kayıt koleksiyondan çıkarıldı."; load(); } catch (error) { status.textContent = error.message; } };
    card.append(type, title, remove); host.append(card);
  }

  async function openDetail(id) {
    returnFocus = document.activeElement;
    try {
      var data = await api("/api/collections/" + id), all = await api("/api/memory/list?archive=active&limit=50"), view = dialog("collectionDetailDialog", data.collection.name);
      view.d.classList.add("yd-collection-detail"); view.form.classList.add("yd-collection-detail-form"); view.form.replaceChildren();
      var header = el("header", { class: "yd-collection-detail-head" }), heading = el("div", {}), close = el("button", { type: "button", "aria-label": "Kapat" }, "Geri");
      heading.append(el("p", { class: "yd-collections-eyebrow" }, "KOLEKSİYON"), el("h2", { id: "collectionDetailDialogTitle", tabindex: "-1" }, data.collection.name), el("p", {}, data.collection.description || "Notlarını ve medyanı tek çalışma alanında düzenle.")); header.append(close, heading);
      var toolbar = el("div", { class: "yd-collection-content-toolbar" }), addMenu = el("details", { class: "yd-add-content" }), addSummary = el("summary", {}, "İçerik Ekle"), addPanel = el("div", { class: "yd-add-content-menu" }), addSelect = el("select", { "aria-label": "Koleksiyona eklenecek kayıt" }), addNote = el("button", { type: "button" }, "Seçili Notu Ekle"), upload = el("button", { type: "button" }, "Medya Yükle"), filter = el("input", { type: "search", placeholder: "İçerikte ara", "aria-label": "Koleksiyon içeriğinde ara" });
      var memberIds = new Set(data.members.map(function (member) { return member.id; })); all.memories.filter(function (memory) { return !memberIds.has(memory.id); }).forEach(function (memory) { addSelect.append(el("option", { value: memory.id }, memory.title)); }); addPanel.append(addSelect, addNote, upload); addMenu.append(addSummary, addPanel); toolbar.append(addMenu, filter);
      var body = el("div", { class: "yd-collection-detail-body" }), content = el("main", { class: "yd-collection-content", "aria-label": "Koleksiyon içeriği" }), noteSection = el("section", { class: "yd-collection-content-section", "aria-labelledby": "collectionNotesTitle" }), noteGrid = el("div", { class: "yd-collection-content-grid", "data-content-grid": "notes" }), mediaSection = el("section", { class: "yd-collection-content-section", "aria-labelledby": "collectionMediaTitle" }), mediaGrid = el("div", { class: "yd-collection-media-grid", "data-content-grid": "media" }), previewHost = el("aside", { class: "yd-media-preview", "aria-label": "Medya önizleme", hidden: "" });
      noteSection.append(el("h3", { id: "collectionNotesTitle" }, "Notlar"), noteGrid); mediaSection.append(el("h3", { id: "collectionMediaTitle" }, "Medya"), mediaGrid); content.append(noteSection, mediaSection); body.append(content, previewHost);
      var status = el("p", { class: "collection-status", role: "status", "aria-live": "polite" }), footer = el("footer", { class: "yd-collection-detail-actions" }), edit = el("button", { type: "button" }, "Bilgileri Düzenle"), destroy = el("button", { type: "button", class: "is-danger" }, "Koleksiyonu Sil"); footer.append(status, edit, destroy); view.form.append(header, toolbar, body, footer);
      data.members.forEach(function (member) { renderNote(member, id, noteGrid, status); }); if (!data.members.length) noteGrid.append(el("p", { class: "yd-media-empty" }, "Bu koleksiyonda henüz not yok."));
      var mediaMount = await window.YDCollectionMedia?.mount({ collectionId: id, grid: mediaGrid, previewHost: previewHost, status: status });
      upload.onclick = function () { addMenu.open = false; mediaMount?.openUpload(upload); };
      addNote.onclick = async function () { if (!addSelect.value) return; try { await api("/api/collections/" + id + "/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordIds: [addSelect.value] }) }); status.textContent = "Kayıt koleksiyona eklendi."; view.d.close(); openDetail(id); } catch (error) { status.textContent = error.message; } };
      filter.oninput = function () { var query = filter.value.trim().toLocaleLowerCase("tr-TR"); view.form.querySelectorAll(".yd-collection-content-card,.yd-media-card").forEach(function (card) { card.hidden = Boolean(query) && !card.textContent.toLocaleLowerCase("tr-TR").includes(query); }); };
      close.onclick = function () { view.d.close(); };
      edit.onclick = function () { openEdit(id, data.collection, status); };
      destroy.onclick = async function () { if (!window.confirm("Koleksiyon silinsin mi? Notların ve medya dosyaların silinmez.")) return; try { await api("/api/collections/" + id, { method: "DELETE" }); view.d.close(); announce("Koleksiyon silindi; içerikler korundu."); load(); } catch (error) { status.textContent = error.message; } };
      view.d.showModal(); heading.querySelector("h2").focus();
    } catch (error) { announce(error.message || "Koleksiyon açılamadı."); }
  }

  function openEdit(id, collection, parentStatus) {
    var view = dialog("collectionEditDialog", "Koleksiyonu Düzenle"), name = field("Ad", "input", { maxlength: "80", required: "" }), description = field("Açıklama", "textarea", { maxlength: "1000" }), area = field("Alan", "select", {}), status = el("p", { class: "collection-status", role: "status", "aria-live": "polite" }), actions = el("div", { class: "collection-form-actions" }), cancel = el("button", { type: "button" }, "Vazgeç"), save = el("button", { type: "submit" }, "Kaydet");
    Object.entries(AREAS).forEach(function (entry) { area.control.append(el("option", { value: entry[0] }, entry[1])); }); name.control.value = collection.name; description.control.value = collection.description; area.control.value = collection.workspaceArea || ""; cancel.onclick = function () { view.d.close(); }; actions.append(cancel, save); view.form.append(name.label, description.label, area.label, status, actions);
    view.form.onsubmit = async function (event) { event.preventDefault(); try { await api("/api/collections/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.control.value, description: description.control.value, workspaceArea: area.control.value || null }) }); parentStatus.textContent = "Koleksiyon güncellendi."; view.d.close(); load(); } catch (error) { status.textContent = error.message; } }; view.d.showModal(); name.control.focus();
  }

  async function feedback(type, key, value, contextRecordId) { try { await api("/api/intelligence/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: type, suggestionKey: key, contextRecordId: contextRecordId, feedback: value }) }); } catch (_) {} }
  function trap(event) { if (event.key !== "Tab") return; var nodes = [...event.currentTarget.querySelectorAll("button,input,textarea,select,summary,a[href]")].filter(function (node) { return !node.disabled && !node.hidden; }), first = nodes[0], last = nodes[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }

  document.addEventListener("DOMContentLoaded", section); window.addEventListener("yasayan-auth-ready", function () { setTimeout(function () { section(); refresh(); }, 0); }); window.addEventListener("collection:suggested", function (event) { openCreate(event.detail || {}); }); window.YDSmartCollections = { load: load, openCreate: openCreate, openDetail: openDetail };
}());
