(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YDCollectionMedia = api;
}(typeof window !== "undefined" ? window : null, function (root) {
  "use strict";

  var MIB = 1024 * 1024;
  var POLICIES = Object.freeze({
    "application/pdf": Object.freeze({ mediaType: "PDF", maxBytes: 25 * MIB }),
    "image/jpeg": Object.freeze({ mediaType: "IMAGE", maxBytes: 10 * MIB }),
    "image/png": Object.freeze({ mediaType: "IMAGE", maxBytes: 10 * MIB }),
    "image/webp": Object.freeze({ mediaType: "IMAGE", maxBytes: 10 * MIB }),
    "audio/mpeg": Object.freeze({ mediaType: "AUDIO", maxBytes: 50 * MIB }),
    "audio/mp4": Object.freeze({ mediaType: "AUDIO", maxBytes: 50 * MIB }),
    "audio/wav": Object.freeze({ mediaType: "AUDIO", maxBytes: 50 * MIB }),
    "audio/ogg": Object.freeze({ mediaType: "AUDIO", maxBytes: 50 * MIB }),
    "video/mp4": Object.freeze({ mediaType: "VIDEO", maxBytes: 100 * MIB }),
    "video/webm": Object.freeze({ mediaType: "VIDEO", maxBytes: 100 * MIB })
  });
  var STATES = Object.freeze(["idle", "selecting", "validating", "uploading", "progress", "verifying", "success", "error", "retry", "quota-exceeded", "unsupported-file", "file-too-large", "auth-expired", "storage-unavailable"]);

  function formatBytes(value) {
    var bytes = Number(value) || 0;
    if (bytes < 1024) return bytes + " B";
    if (bytes < MIB) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KB";
    return (bytes / MIB).toFixed(bytes < 10 * MIB ? 1 : 0) + " MB";
  }

  function validateFile(file) {
    if (!file) return { ok: false, state: "selecting", code: "FILE_REQUIRED", message: "Bir dosya seç." };
    if (!Number.isSafeInteger(file.size) || file.size < 1) return { ok: false, state: "error", code: "INVALID_MEDIA_SIZE", message: "Boş dosyalar yüklenemez." };
    var mimeType = String(file.type || "").trim().toLowerCase();
    var policy = POLICIES[mimeType];
    if (!policy) return { ok: false, state: "unsupported-file", code: "UNSUPPORTED_MEDIA_TYPE", message: "Bu dosya türü desteklenmiyor." };
    if (file.size > policy.maxBytes) return { ok: false, state: "file-too-large", code: "MEDIA_TOO_LARGE", message: "Dosya " + formatBytes(policy.maxBytes) + " sınırını aşıyor." };
    return { ok: true, filename: String(file.name || "media-file"), mimeType: mimeType, mediaType: policy.mediaType, sizeBytes: file.size };
  }

  function errorState(code) {
    if (code === "MEDIA_QUOTA_EXCEEDED") return "quota-exceeded";
    if (code === "UNSUPPORTED_MEDIA_TYPE") return "unsupported-file";
    if (code === "MEDIA_TOO_LARGE") return "file-too-large";
    if (code === "UNAUTHENTICATED") return "auth-expired";
    if (/MEDIA_STORAGE|MEDIA_REQUIRES_POSTGRES/.test(code || "")) return "storage-unavailable";
    return "error";
  }

  function createController(options) {
    options = options || {};
    var request = options.request || async function (path, init) {
      var response = await fetch(path, init);
      var body = await response.json().catch(function () { return {}; });
      if (!response.ok) { var error = new Error(body.error?.message || "İşlem tamamlanamadı."); error.code = body.error?.code || "MEDIA_OPERATION_FAILED"; error.status = response.status; throw error; }
      return body;
    };
    var xhrFactory = options.xhrFactory || function () { return new XMLHttpRequest(); };
    var listener = options.onState || function () {};
    var changed = options.onChanged || function () {};
    var current = { state: "idle", progress: 0, message: "", code: null };
    var attempt = null;
    var lastFile = null;
    var lastCollectionId = null;

    function transition(state, detail) {
      if (!STATES.includes(state)) throw new Error("INVALID_MEDIA_UI_STATE");
      current = Object.assign({ state: state, progress: current.progress || 0, message: "", code: null }, detail || {});
      listener(Object.assign({}, current));
      return current;
    }

    async function cleanup() {
      if (!attempt?.id) return;
      var id = attempt.id;
      attempt = null;
      try { await request("/api/media/" + encodeURIComponent(id), { method: "DELETE" }); } catch (_) {}
    }

    function put(file, upload) {
      return new Promise(function (resolve, reject) {
        var xhr = xhrFactory();
        xhr.open(upload.method || "PUT", upload.url, true);
        xhr.withCredentials = false;
        Object.entries(upload.headers || {}).forEach(function (entry) { xhr.setRequestHeader(entry[0], entry[1]); });
        xhr.upload.onprogress = function (event) {
          var progress = event.lengthComputable && event.total ? Math.min(100, Math.round(event.loaded * 100 / event.total)) : 0;
          transition("progress", { progress: progress, message: progress ? "%" + progress + " yüklendi" : "Yükleniyor" });
        };
        xhr.onload = function () { if (xhr.status >= 200 && xhr.status < 300) resolve(); else { var error = new Error("Doğrudan yükleme başarısız."); error.code = "DIRECT_UPLOAD_FAILED"; reject(error); } };
        xhr.onerror = xhr.onabort = function () { var error = new Error("Doğrudan yükleme kesildi."); error.code = "DIRECT_UPLOAD_FAILED"; reject(error); };
        xhr.send(file);
      });
    }

    async function upload(file, collectionId) {
      lastFile = file; lastCollectionId = collectionId; transition("validating", { progress: 0, message: "Dosya doğrulanıyor" });
      var validated = validateFile(file);
      if (!validated.ok) return transition(validated.state, validated);
      try {
        transition("uploading", { progress: 0, message: "Yükleme yetkisi hazırlanıyor" });
        var initialized = await request("/api/media/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: validated.filename, mimeType: validated.mimeType, mediaType: validated.mediaType, sizeBytes: validated.sizeBytes, collectionId: collectionId }) });
        attempt = { id: initialized.asset.id };
        await put(file, initialized.upload);
        transition("verifying", { progress: 100, message: "Dosya sunucuda doğrulanıyor" });
        var completed = await request("/api/media/" + encodeURIComponent(attempt.id) + "/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        attempt = null;
        transition("success", { progress: 100, message: "Medya koleksiyona eklendi", asset: completed.asset });
        await changed(completed.asset);
        return current;
      } catch (error) {
        return transition(errorState(error.code), { progress: current.progress, code: error.code || "MEDIA_OPERATION_FAILED", message: error.message || "Yükleme tamamlanamadı." });
      }
    }

    async function retry() {
      if (!lastFile || !lastCollectionId) return transition("error", { code: "RETRY_UNAVAILABLE", message: "Yeniden denenecek dosya bulunamadı." });
      transition("retry", { progress: 0, message: "Önceki deneme temizleniyor" });
      await cleanup();
      return upload(lastFile, lastCollectionId);
    }

    return Object.freeze({ upload: upload, retry: retry, cleanup: cleanup, transition: transition, getState: function () { return Object.assign({}, current); }, getAttemptId: function () { return attempt?.id || null; } });
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { if (key === "class") node.className = attrs[key]; else node.setAttribute(key, attrs[key]); });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function uploadDialog(collectionId, onChanged, returnFocus) {
    document.getElementById("collectionMediaUploadDialog")?.remove();
    var dialog = el("dialog", { id: "collectionMediaUploadDialog", class: "yd-media-upload-sheet", "aria-labelledby": "collectionMediaUploadTitle" });
    var form = el("form", { method: "dialog" });
    var title = el("h2", { id: "collectionMediaUploadTitle" }, "Medya Yükle");
    var copy = el("p", {}, "PDF, görsel, ses veya video dosyanı doğrudan özel depolamaya yükle.");
    var input = el("input", { type: "file", accept: Object.keys(POLICIES).join(","), "aria-label": "Yüklenecek medya" });
    var progress = el("progress", { max: "100", value: "0", "aria-label": "Yükleme ilerlemesi" });
    var status = el("p", { class: "yd-media-upload-status", role: "status", "aria-live": "polite" }, "Bir dosya seç.");
    var actions = el("div", { class: "yd-media-upload-actions" });
    var cancel = el("button", { type: "button" }, "Vazgeç");
    var submit = el("button", { type: "button" }, "Yükle");
    var retry = el("button", { type: "button", hidden: "" }, "Yeniden Dene");
    var controller = createController({ onChanged: onChanged, onState: function (state) {
      dialog.dataset.mediaState = state.state; progress.value = state.progress || 0; status.textContent = state.message || state.state;
      var busy = ["validating", "uploading", "progress", "verifying", "retry"].includes(state.state);
      input.disabled = busy; submit.disabled = busy; retry.hidden = !["error", "quota-exceeded", "auth-expired", "storage-unavailable"].includes(state.state);
      if (state.state === "success") root.setTimeout(function () { dialog.close(); }, 450);
    } });
    input.addEventListener("click", function () { controller.transition("selecting", { message: "Dosya seçiliyor" }); });
    input.addEventListener("change", function () { var check = validateFile(input.files[0]); controller.transition(check.ok ? "idle" : check.state, check.ok ? { message: input.files[0].name + " seçildi" } : check); });
    submit.onclick = function () { controller.upload(input.files[0], collectionId); };
    retry.onclick = function () { controller.retry(); };
    cancel.onclick = async function () { await controller.cleanup(); dialog.close(); };
    dialog.oncancel = function (event) { event.preventDefault(); cancel.click(); };
    dialog.onclose = function () { returnFocus?.focus?.(); dialog.remove(); };
    actions.append(cancel, retry, submit); form.append(title, copy, input, progress, status, actions); dialog.append(form); document.body.append(dialog); dialog.showModal(); input.focus();
    return dialog;
  }

  function preview(asset, host, onChanged) {
    host.replaceChildren(); host.dataset.previewType = String(asset.mediaType || "").toLowerCase();
    var head = el("header", { class: "yd-media-preview-head" });
    var heading = el("h3", {}, asset.safeFilename || asset.originalFilename);
    var close = el("button", { type: "button", "aria-label": "Medya önizlemesini kapat" }, "Kapat");
    var body = el("div", { class: "yd-media-preview-body" }, "Özel erişim hazırlanıyor…");
    var meta = el("p", { class: "yd-media-meta" }, asset.mediaType + " · " + formatBytes(asset.sizeBytes));
    var actions = el("div", { class: "yd-media-preview-actions" });
    var remove = el("button", { type: "button" }, "Koleksiyondan Çıkar");
    var destroy = el("button", { type: "button", class: "is-danger" }, "Medyayı Kalıcı Sil");
    function teardown() { body.querySelectorAll("img,audio,video").forEach(function (node) { node.removeAttribute("src"); node.load?.(); }); body.querySelectorAll("a[href]").forEach(function (node) { node.removeAttribute("href"); }); host.replaceChildren(); host.hidden = true; }
    close.onclick = teardown;
    remove.onclick = async function () { if (!root.confirm("Medya yalnızca bu koleksiyondan çıkarılsın mı? Dosya korunur.")) return; await apiRequest("/api/collections/" + encodeURIComponent(host.dataset.collectionId) + "/media/" + encodeURIComponent(asset.id), { method: "DELETE" }); teardown(); await onChanged(); };
    destroy.onclick = async function () { if (!root.confirm("Medya kalıcı olarak silinsin mi? Bu işlem dosyayı da kaldırır.")) return; await apiRequest("/api/media/" + encodeURIComponent(asset.id), { method: "DELETE" }); teardown(); await onChanged(); };
    head.append(heading, close); actions.append(remove, destroy); host.append(head, body, meta, actions); host.hidden = false;
    apiRequest("/api/media/" + encodeURIComponent(asset.id) + "/access").then(function (data) {
      body.replaceChildren(); var url = data.access.url;
      if (asset.mediaType === "PDF") { var link = el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, "PDF’i Özel Olarak Aç"); body.append(link); }
      if (asset.mediaType === "IMAGE") body.append(el("img", { src: url, alt: asset.safeFilename || "Koleksiyon görseli" }));
      if (asset.mediaType === "AUDIO") body.append(el("audio", { src: url, controls: "", preload: "metadata" }));
      if (asset.mediaType === "VIDEO") body.append(el("video", { src: url, controls: "", preload: "metadata", playsinline: "" }));
    }).catch(function (error) { body.textContent = error.message; });
  }

  async function apiRequest(path, init) {
    var response = await fetch(path, init);
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) { var error = new Error(body.error?.message || "İşlem tamamlanamadı."); error.code = body.error?.code; throw error; }
    return body;
  }

  function renderCard(asset, previewHost, onChanged) {
    var card = el("article", { class: "yd-media-card", tabindex: "0", "data-media-type": String(asset.mediaType || "").toLowerCase() });
    var mark = el("div", { class: "yd-media-card-mark", "aria-hidden": "true" }, ({ PDF: "PDF", IMAGE: "IMG", AUDIO: "AUD", VIDEO: "VID" })[asset.mediaType] || "MED");
    var name = el("strong", {}, asset.safeFilename || asset.originalFilename);
    var meta = el("span", {}, asset.mediaType + " · " + formatBytes(asset.sizeBytes));
    var open = el("button", { type: "button" }, asset.mediaType === "PDF" ? "Özel Aç" : "Önizle");
    open.onclick = function () { preview(asset, previewHost, onChanged); };
    card.onkeydown = function (event) { if ((event.key === "Enter" || event.key === " ") && event.target === card) { event.preventDefault(); open.click(); } };
    card.append(mark, name, meta, open); return card;
  }

  async function mount(options) {
    var collectionId = options.collectionId, grid = options.grid, previewHost = options.previewHost, status = options.status;
    previewHost.dataset.collectionId = collectionId;
    async function refresh() {
      try {
        status.textContent = "Koleksiyon medyası yükleniyor.";
        var data = await apiRequest("/api/collections/" + encodeURIComponent(collectionId) + "/media");
        grid.replaceChildren();
        if (!data.media.length) grid.append(el("p", { class: "yd-media-empty" }, "Bu koleksiyonda henüz medya yok."));
        data.media.forEach(function (asset) { grid.append(renderCard(asset, previewHost, refresh)); });
        status.textContent = data.media.length + " medya gösteriliyor.";
        return data.media;
      } catch (error) { status.textContent = error.message; return []; }
    }
    await refresh();
    return { refresh: refresh, openUpload: function (focus) { return uploadDialog(collectionId, refresh, focus); } };
  }

  return Object.freeze({ POLICIES: POLICIES, STATES: STATES, formatBytes: formatBytes, validateFile: validateFile, errorState: errorState, createController: createController, uploadDialog: uploadDialog, renderCard: renderCard, mount: mount });
}));
