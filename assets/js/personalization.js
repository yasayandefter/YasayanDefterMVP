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
  var MAX_INPUT_BYTES = 8 * 1024 * 1024;
  var MAX_OUTPUT_BYTES = 900 * 1024;
  var background = { blob: null, url: "", position: "center", overlay: 35, blur: 0 };
  var pendingBackground = null;

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
  function backgroundStatus(text, kind) {
    var node = document.getElementById("notebookBackgroundStatus"); if (!node) return;
    node.textContent = text || ""; node.className = "personalization-status " + (kind || "");
  }
  function openBackgroundDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open("yasayan-defter-personalization", 1);
      request.onupgradeneeded = function () { if (!request.result.objectStoreNames.contains("notebook")) request.result.createObjectStore("notebook"); };
      request.onsuccess = function () { resolve(request.result); }; request.onerror = function () { reject(request.error); };
    });
  }
  async function localBackgroundGet() { var db = await openBackgroundDb(); return new Promise(function (resolve, reject) { var request = db.transaction("notebook").objectStore("notebook").get("background"); request.onsuccess = function () { db.close(); resolve(request.result || null); }; request.onerror = function () { db.close(); reject(request.error); }; }); }
  async function localBackgroundPut(value) { var db = await openBackgroundDb(); return new Promise(function (resolve, reject) { var transaction = db.transaction("notebook", "readwrite"); transaction.objectStore("notebook").put(value, "background"); transaction.oncomplete = function () { db.close(); resolve(); }; transaction.onerror = function () { db.close(); reject(transaction.error); }; }); }
  async function localBackgroundDelete() { var db = await openBackgroundDb(); return new Promise(function (resolve, reject) { var transaction = db.transaction("notebook", "readwrite"); transaction.objectStore("notebook").delete("background"); transaction.oncomplete = function () { db.close(); resolve(); }; transaction.onerror = function () { db.close(); reject(transaction.error); }; }); }
  function releaseBackgroundUrl() { if (background.url) URL.revokeObjectURL(background.url); background.url = ""; }
  function applyBackground(value) {
    releaseBackgroundUrl(); background = Object.assign({ blob: null, position: "center", overlay: 35, blur: 0 }, value || {});
    var root = document.documentElement;
    if (background.blob) { background.url = URL.createObjectURL(background.blob); root.dataset.notebookBackground = "custom"; root.style.setProperty("--yd-notebook-background", 'url("' + background.url + '")'); }
    else { delete root.dataset.notebookBackground; root.style.removeProperty("--yd-notebook-background"); }
    root.style.setProperty("--yd-notebook-position", background.position);
    root.style.setProperty("--yd-notebook-overlay", String(background.overlay / 100));
    root.style.setProperty("--yd-notebook-blur", background.blur + "px");
    var preview = document.getElementById("notebookBackgroundPreviewImage"); if (preview) { preview.src = background.url || ""; preview.hidden = !background.url; }
  }
  async function loadBackgroundForAuth(detail) {
    var auth = detail || authState();
    try {
      if (auth.authenticated === true) {
        var response = await fetch("/api/auth/notebook-background", { credentials: "same-origin", headers: { Accept: "image/jpeg,image/png,image/webp" } });
        if (response.status === 204) return applyBackground(null);
        if (!response.ok) throw new Error("Arka plan yüklenemedi.");
        return applyBackground({ blob: await response.blob(), position: response.headers.get("X-Notebook-Position") || "center", overlay: Number(response.headers.get("X-Notebook-Overlay") || 35), blur: Number(response.headers.get("X-Notebook-Blur") || 0) });
      }
      applyBackground(await localBackgroundGet());
    } catch (_) { applyBackground(null); }
  }
  function canvasBlob(canvas, type, quality) { return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); }); }
  async function processImage(file) {
    if (!file || file.size > MAX_INPUT_BYTES) throw new Error("Fotoğraf en fazla 8 MB olabilir.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Yalnız JPEG, PNG veya WEBP fotoğraf seçebilirsiniz. HEIC, SVG ve GIF desteklenmiyor.");
    var bitmap; try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (_) { throw new Error("Fotoğraf çözümlenemedi. JPEG, PNG veya WEBP formatında başka bir fotoğraf deneyin."); }
    try {
      var scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height)); var canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      var context = canvas.getContext("2d", { alpha: false }); context.fillStyle = "#101820"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      var blob = null; for (var quality = .84; quality >= .48; quality -= .08) { blob = await canvasBlob(canvas, "image/webp", quality); if (blob && blob.size <= MAX_OUTPUT_BYTES) break; }
      canvas.width = canvas.height = 1; if (!blob || blob.size > MAX_OUTPUT_BYTES) throw new Error("Fotoğraf güvenli yükleme boyutuna indirilemedi. Daha küçük bir fotoğraf deneyin."); return blob;
    } finally { bitmap.close?.(); }
  }
  function backgroundPanel() {
    var section = document.createElement("fieldset"); section.className = "personalization-group notebook-background-group";
    var legend = document.createElement("legend"); legend.textContent = "Özel Defter Arka Planı";
    var help = document.createElement("p"); help.className = "personalization-help"; help.textContent = "Yalnız Defterim ve kişisel defter yüzeylerinde görünür. Fotoğraflar özel tutulur.";
    var picker = document.createElement("label"); picker.className = "notebook-background-picker"; picker.htmlFor = "notebookBackgroundFile"; picker.textContent = "Fotoğraf seç";
    var input = document.createElement("input"); input.id = "notebookBackgroundFile"; input.type = "file"; input.accept = "image/jpeg,image/png,image/webp";
    var preview = document.createElement("div"); preview.className = "notebook-background-preview"; var image = document.createElement("img"); image.id = "notebookBackgroundPreviewImage"; image.alt = ""; image.hidden = !background.url; image.src = background.url || ""; preview.appendChild(image);
    function range(id, labelText, min, max, value, suffix) { var wrap = document.createElement("label"); wrap.className = "notebook-background-control"; var line = document.createElement("span"); var output = document.createElement("output"); line.textContent = labelText + " "; output.value = value + suffix; line.appendChild(output); var slider = document.createElement("input"); slider.type = "range"; slider.id = id; slider.min = min; slider.max = max; slider.value = value; slider.addEventListener("input", function () { output.value = slider.value + suffix; previewSettings(); }); wrap.append(line, slider); return wrap; }
    var controls = document.createElement("div"); controls.className = "notebook-background-controls";
    var positionLabel = document.createElement("label"); positionLabel.className = "notebook-background-control"; positionLabel.textContent = "Konum "; var position = document.createElement("select"); position.id = "notebookBackgroundPosition"; [["center","Orta"],["top","Üst"],["bottom","Alt"]].forEach(function (item) { var option = document.createElement("option"); option.value=item[0]; option.textContent=item[1]; position.appendChild(option); }); position.value = background.position; position.addEventListener("change", previewSettings); positionLabel.appendChild(position);
    controls.append(positionLabel, range("notebookBackgroundOverlay", "Koyuluk", 0, 70, background.overlay, "%"), range("notebookBackgroundBlur", "Blur", 0, 12, background.blur, " px"));
    var actions = document.createElement("div"); actions.className = "notebook-background-actions"; var applyButton = document.createElement("button"); applyButton.type="button"; applyButton.className="commercial-primary"; applyButton.textContent="Uygula"; applyButton.id="applyNotebookBackground"; var cancel = document.createElement("button"); cancel.type="button"; cancel.className="commercial-secondary"; cancel.textContent="Önizlemeyi iptal et"; var remove = document.createElement("button"); remove.type="button"; remove.className="commercial-secondary notebook-background-remove"; remove.textContent="Kaldır"; remove.id="removeNotebookBackground"; var output = document.createElement("p"); output.id="notebookBackgroundStatus"; output.className="personalization-status"; output.setAttribute("role","status"); output.setAttribute("aria-live","polite"); actions.append(applyButton,cancel,remove);
    section.append(legend,help,picker,input,preview,controls,actions,output);
    function settings() { return { position: position.value, overlay: Number(document.getElementById("notebookBackgroundOverlay").value), blur: Number(document.getElementById("notebookBackgroundBlur").value) }; }
    function previewSettings() { var next = Object.assign({}, background, settings()); if (pendingBackground) next.blob = pendingBackground; applyBackground(next); }
    input.addEventListener("change", async function () { try { backgroundStatus("Fotoğraf hazırlanıyor…", ""); pendingBackground = await processImage(input.files[0]); previewSettings(); backgroundStatus("Önizleme hazır. Uygula ile kaydedebilirsiniz.", "is-preview"); } catch (error) { pendingBackground=null; input.value=""; backgroundStatus(error.message, "is-error"); } });
    cancel.addEventListener("click", function () { pendingBackground=null; input.value=""; loadBackgroundForAuth(); backgroundStatus("Değişiklikler iptal edildi.", ""); });
    applyButton.addEventListener("click", async function () { var blob = pendingBackground || background.blob; if (!blob) return backgroundStatus("Önce bir fotoğraf seçin.", "is-error"); applyButton.disabled=true; try { var value=Object.assign({blob:blob},settings()); if(authState().authenticated===true){var response=await fetch("/api/auth/notebook-background",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":blob.type,"X-Notebook-Position":value.position,"X-Notebook-Overlay":String(value.overlay),"X-Notebook-Blur":String(value.blur)},body:blob});var payload=await response.json().catch(function(){return{};});if(!response.ok)throw new Error(payload?.error?.message||"Arka plan yüklenemedi.");}else await localBackgroundPut(value); pendingBackground=null; applyBackground(value); backgroundStatus("Defter arka planınız uygulandı.","is-success"); }catch(error){backgroundStatus(error.message||"Arka plan yüklenemedi.","is-error");}finally{applyButton.disabled=false;} });
    remove.addEventListener("click", async function () { remove.disabled=true; try { if(authState().authenticated===true){var response=await fetch("/api/auth/notebook-background",{method:"DELETE",credentials:"same-origin"});if(!response.ok)throw new Error("Arka plan kaldırılamadı.");}else await localBackgroundDelete(); pendingBackground=null; input.value=""; applyBackground(null); backgroundStatus("Özel arka plan kaldırıldı.","is-success"); }catch(error){backgroundStatus(error.message,"is-error");}finally{remove.disabled=false;} });
    return section;
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
    panel.appendChild(backgroundPanel());
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
    loadBackgroundForAuth(auth);
  }

  apply(current);
  media.addEventListener?.("change", function () { if (current.theme === "system") apply(current); });
  document.addEventListener("DOMContentLoaded", function () { loadBackgroundForAuth(); window.setTimeout(addPanel, 0); });
  window.addEventListener("yasayan-auth-ready", function (event) { restoreForAuth(event.detail); window.setTimeout(addPanel, 0); });
  window.addEventListener("yasayan-profile-updated", function () { window.setTimeout(addPanel, 0); });
  window.YasayanDefterPersonalization = { apply: apply, defaults: Object.assign({}, DEFAULTS), options: OPTIONS };
}());
