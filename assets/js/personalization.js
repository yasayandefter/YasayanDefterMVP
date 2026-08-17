(function () {
  "use strict";

  var KEY = "yasayan-defter-public-preferences";
  var DEFAULTS = { theme: "living", notebookWritingStyle: "modern", notebookPageStyle: "plain" };
  var OPTIONS = {
    theme: [["system", "Sistem"], ["living", "Yaşayan Defter"], ["light", "Aydınlık"], ["night", "Gece"], ["focus", "Odak"]],
    notebookWritingStyle: [["modern", "Modern"], ["classic", "Klasik"], ["handwriting", "El yazısı"], ["rounded", "Yuvarlak"], ["minimal", "Minimal"]],
    notebookPageStyle: [["plain", "Düz"], ["lined", "Çizgili"], ["grid", "Kareli"], ["dotted", "Noktalı"]]
  };
  var current = readLocal();
  var saved = Object.assign({}, current);
  var media = window.matchMedia("(prefers-color-scheme: light)");

  function valid(value) {
    return value && typeof value === "object" && Object.keys(OPTIONS).every(function (key) { return OPTIONS[key].some(function (item) { return item[0] === value[key]; }); });
  }
  function readLocal() {
    try { var parsed = JSON.parse(localStorage.getItem(KEY) || "null"); return valid(parsed) ? parsed : Object.assign({}, DEFAULTS); }
    catch (_) { return Object.assign({}, DEFAULTS); }
  }
  function writeLocal(value) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (_) {} }
  function apply(value) {
    if (!valid(value)) value = DEFAULTS;
    current = Object.assign({}, value);
    var resolved = value.theme === "system" ? (media.matches ? "light" : "living") : value.theme;
    document.documentElement.dataset.theme = value.theme;
    document.documentElement.dataset.resolvedTheme = resolved;
    document.documentElement.dataset.notebookWriting = value.notebookWritingStyle;
    document.documentElement.dataset.notebookPage = value.notebookPageStyle;
    window.dispatchEvent(new CustomEvent("yasayan-preferences-preview", { detail: Object.assign({}, value) }));
  }
  function authState() { return window.YasayanDefterAuth || {}; }
  function status(text, kind) {
    var node = document.getElementById("personalizationStatus");
    if (!node) return;
    node.textContent = text || "";
    node.className = "personalization-status " + (kind || "");
  }
  function syncInputs(value) {
    Object.keys(OPTIONS).forEach(function (key) {
      var input = document.querySelector('input[name="pref-' + key + '"][value="' + value[key] + '"]');
      if (input) input.checked = true;
    });
  }
  function choiceGroup(key, title, description) {
    var section = document.createElement("fieldset"); section.className = "personalization-group";
    var legend = document.createElement("legend"); legend.textContent = title; section.appendChild(legend);
    var note = document.createElement("p"); note.className = "personalization-help"; note.textContent = description; section.appendChild(note);
    var grid = document.createElement("div"); grid.className = "personalization-options personalization-options-" + key;
    OPTIONS[key].forEach(function (item) {
      var id = "pref-" + key + "-" + item[0];
      var input = document.createElement("input"); input.type = "radio"; input.id = id; input.name = "pref-" + key; input.value = item[0]; input.checked = current[key] === item[0];
      var label = document.createElement("label"); label.htmlFor = id; label.className = "personalization-option personalization-option-" + item[0];
      var preview = document.createElement("span"); preview.className = "personalization-swatch"; preview.setAttribute("aria-hidden", "true");
      var name = document.createElement("strong"); name.textContent = item[1];
      var selected = document.createElement("span"); selected.className = "personalization-selected"; selected.textContent = "✓ Seçili";
      label.append(preview, name, selected); grid.append(input, label);
      input.addEventListener("change", function () { current[key] = item[0]; apply(current); status("Önizleme uygulanıyor. Kaydetmeyi unutmayın.", "is-preview"); });
    });
    section.appendChild(grid); return section;
  }
  function addPanel() {
    var profile = document.getElementById("commercialProfile");
    if (!profile || document.getElementById("personalizationPanel")) return;
    var panel = document.createElement("section"); panel.id = "personalizationPanel"; panel.className = "personalization-panel"; panel.setAttribute("aria-labelledby", "personalizationTitle");
    var head = document.createElement("div"); head.className = "personalization-head";
    var copy = document.createElement("div"); var kicker = document.createElement("p"); kicker.className = "commercial-kicker"; kicker.textContent = "Kişiselleştirme";
    var title = document.createElement("h3"); title.id = "personalizationTitle"; title.textContent = "Görünüm ve Tema";
    var lede = document.createElement("p"); lede.className = "commercial-muted"; lede.textContent = "Yaşayan Defter'i çalışma tarzına göre kişiselleştir.";
    copy.append(kicker, title, lede); head.appendChild(copy); panel.appendChild(head);
    panel.appendChild(choiceGroup("theme", "Tema", "Uygulamanın genel renk ve yüzey görünümü."));
    panel.appendChild(choiceGroup("notebookWritingStyle", "Defter Yazı Stili", "Yalnız Defterim ve kişisel defter yüzeylerinde kullanılır."));
    panel.appendChild(choiceGroup("notebookPageStyle", "Defter Sayfa Stili", "Sayfa deseni yalnız Defterim kartlarına uygulanır."));
    var actions = document.createElement("div"); actions.className = "personalization-actions";
    var save = document.createElement("button"); save.type = "button"; save.className = "commercial-primary"; save.id = "savePersonalization"; save.textContent = "Tercihleri kaydet";
    var output = document.createElement("p"); output.id = "personalizationStatus"; output.className = "personalization-status"; output.setAttribute("role", "status"); output.setAttribute("aria-live", "polite");
    actions.append(save, output); panel.appendChild(actions); profile.appendChild(panel);
    save.addEventListener("click", savePreferences);
  }
  async function savePreferences() {
    var button = document.getElementById("savePersonalization"); if (button) button.disabled = true;
    var before = Object.assign({}, saved); status("Kaydediliyor…", "");
    try {
      var auth = authState();
      if (auth.authenticated === true && auth.user) {
        var response = await fetch("/api/auth/preferences", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(current) });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload?.error?.message || "Tercihler kaydedilemedi.");
        saved = Object.assign({}, payload.preferences); current = Object.assign({}, saved); apply(saved);
        auth.user.preferences = Object.assign({}, saved);
      } else {
        writeLocal(current); saved = Object.assign({}, current);
      }
      syncInputs(saved); status("Görünüm tercihleriniz kaydedildi.", "is-success");
    } catch (error) {
      current = before; saved = before; apply(before); syncInputs(before); status(error.message || "Tercihler kaydedilemedi.", "is-error");
    } finally { if (button) button.disabled = false; }
  }
  function restoreForAuth(detail) {
    var auth = detail || authState();
    var next = auth.authenticated === true && valid(auth.user?.preferences) ? auth.user.preferences : readLocal();
    saved = Object.assign({}, next); apply(next); syncInputs(next);
  }

  apply(current);
  media.addEventListener?.("change", function () { if (current.theme === "system") apply(current); });
  document.addEventListener("DOMContentLoaded", function () { window.setTimeout(addPanel, 0); });
  window.addEventListener("yasayan-auth-ready", function (event) { restoreForAuth(event.detail); window.setTimeout(addPanel, 0); });
  window.addEventListener("yasayan-profile-updated", function () { window.setTimeout(addPanel, 0); });
  window.YasayanDefterPersonalization = { apply: apply, defaults: Object.assign({}, DEFAULTS), options: OPTIONS };
}());
