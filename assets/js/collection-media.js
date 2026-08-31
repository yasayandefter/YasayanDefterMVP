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

  function stateMessage(state, fallback) {
    if (state === "quota-exceeded") return "Medya alanın dolu. Yeni dosya eklemek için mevcut medyalardan birini sil.";
    if (state === "auth-expired") return "Oturumun sona erdi. Devam etmek için yeniden giriş yap.";
    if (state === "storage-unavailable") return "Medya yükleme şu anda kullanılamıyor. Dosyan korunmadı; daha sonra yeniden deneyebilirsin.";
    return fallback || "Yükleme tamamlanamadı.";
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
          transition("progress", { progress: progress, message: progress ? "Yükleniyor · %" + progress : "Yükleniyor" });
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
        transition("uploading", { progress: 0, message: "Yükleme hazırlanıyor" });
        var initialized = await request("/api/media/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: validated.filename, mimeType: validated.mimeType, mediaType: validated.mediaType, sizeBytes: validated.sizeBytes, collectionId: collectionId }) });
        attempt = { id: initialized.asset.id };
        await put(file, initialized.upload);
        transition("verifying", { progress: 100, message: "Dosya kontrol ediliyor" });
        var completed = await request("/api/media/" + encodeURIComponent(attempt.id) + "/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        attempt = null;
        await changed(completed.asset);
        transition("success", { progress: 100, message: "Dosya koleksiyonuna eklendi.", asset: completed.asset });
        return current;
      } catch (error) {
        var state = errorState(error.code);
        return transition(state, { progress: current.progress, code: error.code || "MEDIA_OPERATION_FAILED", message: stateMessage(state, error.message) });
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
    var copy = el("p", {}, "PDF, görsel, ses veya video dosyanı koleksiyonuna güvenli biçimde ekle.");
    var input = el("input", { type: "file", accept: Object.keys(POLICIES).join(","), "aria-label": "Yüklenecek medya" });
    var progress = el("progress", { max: "100", value: "0", "aria-label": "Yükleme ilerlemesi" });
    var status = el("p", { class: "yd-media-upload-status", role: "status", "aria-live": "polite" }, "Bir dosya seç.");
    var actions = el("div", { class: "yd-media-upload-actions" });
    var cancel = el("button", { type: "button" }, "Vazgeç");
    var submit = el("button", { type: "button" }, "Yükle");
    var retry = el("button", { type: "button", hidden: "" }, "Yeniden dene"), successFocus = null;
    var controller = createController({ onChanged: async function (asset) { successFocus = await onChanged(asset); return successFocus; }, onState: function (state) {
      dialog.dataset.mediaState = state.state; progress.value = state.progress || 0; status.textContent = state.message || state.state;
      var busy = ["validating", "uploading", "progress", "verifying", "retry"].includes(state.state);
      form.setAttribute("aria-busy", String(busy)); input.disabled = busy || state.state === "success"; submit.textContent = ["unsupported-file", "file-too-large"].includes(state.state) ? "Başka dosya seç" : "Yükle"; submit.disabled = busy || state.state === "success" || ["quota-exceeded", "auth-expired", "storage-unavailable"].includes(state.state); submit.hidden = state.state === "success";
      retry.hidden = state.state !== "error"; retry.textContent = "Yeniden dene";
      if (state.state === "auth-expired") { retry.hidden = false; retry.textContent = "Oturum aç"; }
      if (["unsupported-file", "file-too-large"].includes(state.state)) { input.focus(); }
      if (state.state === "success") { cancel.textContent = "Bitti"; cancel.focus(); }
      if (["error", "auth-expired"].includes(state.state)) retry.focus();
    } });
    input.addEventListener("click", function () { controller.transition("selecting", { message: "Dosya seçiliyor" }); });
    input.addEventListener("change", function () { var check = validateFile(input.files[0]); controller.transition(check.ok ? "idle" : check.state, check.ok ? { message: input.files[0].name + " seçildi" } : check); });
    submit.onclick = function () { if (["unsupported-file", "file-too-large"].includes(dialog.dataset.mediaState)) { input.click(); return; } controller.upload(input.files[0], collectionId); };
    retry.onclick = function () { if (dialog.dataset.mediaState === "auth-expired") { dialog.close(); document.querySelector("[data-open-login]")?.click(); return; } controller.retry(); };
    cancel.onclick = async function () { await controller.cleanup(); dialog.close(); };
    dialog.oncancel = function (event) { event.preventDefault(); cancel.click(); };
    dialog.onclose = function () { (successFocus || returnFocus)?.focus?.(); dialog.remove(); };
    actions.append(cancel, retry, submit); form.append(title, copy, input, progress, status, actions); dialog.append(form); document.body.append(dialog); dialog.showModal(); input.focus();
    return dialog;
  }

  function createPreviewController(host, onChanged) {
    var generation = 0, aborter = null, origin = null, activeCard = null;
    function clearTransient() { host.querySelectorAll("img,audio,video").forEach(function (node) { node.removeAttribute("src"); node.load?.(); }); host.querySelectorAll("a[href]").forEach(function (node) { node.removeAttribute("href"); }); }
    function close(options) { options = options || {}; generation += 1; aborter?.abort(); aborter = null; clearTransient(); activeCard?.classList.remove("is-preview-active"); activeCard = null; host.replaceChildren(); host.hidden = true; host.removeAttribute("aria-busy"); var target = origin; origin = null; if (options.restoreFocus !== false && target?.isConnected) target.focus(); }
    async function open(asset, source) {
      close({ restoreFocus: false }); origin = source; activeCard = source?.closest(".yd-media-card") || null; activeCard?.classList.add("is-preview-active"); host.hidden = false; host.dataset.previewType = String(asset.mediaType || "").toLowerCase(); host.setAttribute("aria-busy", "true");
      var requestGeneration = ++generation, head = el("header", { class: "yd-media-preview-head" }), heading = el("h3", { tabindex: "-1" }, asset.safeFilename || asset.originalFilename), closeButton = el("button", { type: "button", "aria-label": "Önizlemeyi kapat" }, "Kapat"), body = el("div", { class: "yd-media-preview-body", role: "status", "aria-live": "polite" }), loading = el("div", { class: "yd-media-preview-state" }, "Önizleme hazırlanıyor…"), meta = el("p", { class: "yd-media-meta" }, typeLabel(asset.mediaType) + " · " + formatBytes(asset.sizeBytes) + formatDate(asset.createdAt)), actions = el("div", { class: "yd-media-preview-actions" }), remove = el("button", { type: "button" }, "Koleksiyondan çıkar"), destroyButton = el("button", { type: "button", class: "is-danger" }, "Dosyayı kalıcı sil");
      body.append(loading); closeButton.onclick = function () { close(); }; remove.onclick = async function () { if (!root.confirm("Dosya yalnızca bu koleksiyondan çıkarılsın mı? Dosya korunur.")) return; remove.disabled = true; try { await apiRequest("/api/collections/" + encodeURIComponent(host.dataset.collectionId) + "/media/" + encodeURIComponent(asset.id), { method: "DELETE" }); close({ restoreFocus: false }); await onChanged(); } catch (_) { remove.disabled = false; body.textContent = "Dosya koleksiyondan çıkarılamadı."; } }; destroyButton.onclick = async function () { if (!root.confirm("Dosya kalıcı olarak silinsin mi? Bu işlem geri alınamaz.")) return; destroyButton.disabled = true; try { await apiRequest("/api/media/" + encodeURIComponent(asset.id), { method: "DELETE" }); close({ restoreFocus: false }); await onChanged(); } catch (_) { destroyButton.disabled = false; body.textContent = "Dosya silinemedi."; } };
      head.append(heading, closeButton); actions.append(remove, destroyButton); host.append(head, body, meta, actions); heading.focus(); aborter = typeof AbortController === "function" ? new AbortController() : null;
      async function load() { body.replaceChildren(el("div", { class: "yd-media-preview-state" }, "Önizleme hazırlanıyor…")); host.setAttribute("aria-busy", "true"); try { var data = await apiRequest("/api/media/" + encodeURIComponent(asset.id) + "/access", aborter ? { signal: aborter.signal } : undefined); if (requestGeneration !== generation || host.hidden || !host.isConnected) return; body.replaceChildren(); var url = data.access.url; if (asset.mediaType === "PDF") body.append(el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, "PDF’i aç")); if (asset.mediaType === "IMAGE") body.append(el("img", { src: url, alt: asset.safeFilename || "Koleksiyon görseli" })); if (asset.mediaType === "AUDIO") body.append(el("audio", { src: url, controls: "", preload: "metadata" })); if (asset.mediaType === "VIDEO") body.append(el("video", { src: url, controls: "", preload: "metadata", playsinline: "" })); host.removeAttribute("aria-busy"); } catch (error) { if (requestGeneration !== generation || error.name === "AbortError") return; host.removeAttribute("aria-busy"); var retry = el("button", { type: "button" }, "Yeniden dene"); retry.onclick = function () { aborter = typeof AbortController === "function" ? new AbortController() : null; load(); }; body.replaceChildren(el("p", {}, "Önizleme yüklenemedi."), retry); retry.focus(); } }
      load();
    }
    return Object.freeze({ open: open, close: close, destroy: function () { close({ restoreFocus: false }); } });
  }

  function typeLabel(type) { return ({ PDF: "Belge", IMAGE: "Görsel", AUDIO: "Ses", VIDEO: "Video" })[type] || "İçerik"; }
  function formatDate(value) { if (!value) return ""; var date = new Date(value); return Number.isNaN(date.getTime()) ? "" : " · " + new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(date); }

  async function apiRequest(path, init) {
    var response = await fetch(path, init);
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) { var error = new Error(body.error?.message || "İşlem tamamlanamadı."); error.code = body.error?.code; throw error; }
    return body;
  }

  function renderCard(asset, previewController, onChanged) {
    var kind = ({ PDF: "document", IMAGE: "image", AUDIO: "audio", VIDEO: "video" })[asset.mediaType] || "media", label = typeLabel(asset.mediaType);
    var card = el("article", { class: "yd-media-card", "data-media-type": String(asset.mediaType || "").toLowerCase(), "data-content-kind": kind, "data-media-id": asset.id, "data-search-text": ((asset.safeFilename || asset.originalFilename || "") + " " + label).toLocaleLowerCase("tr-TR") });
    var visual = el("div", { class: "yd-content-visual yd-content-visual-" + kind, "aria-hidden": "true" }, ({ PDF: "≡", IMAGE: "◇", AUDIO: "◖", VIDEO: "▷" })[asset.mediaType] || "·");
    var mark = el("span", { class: "yd-media-card-mark" }, label);
    var name = el("strong", {}, asset.safeFilename || asset.originalFilename);
    name.title = asset.safeFilename || asset.originalFilename || "";
    var meta = el("span", { class: "yd-content-meta" }, formatBytes(asset.sizeBytes) + formatDate(asset.createdAt));
    var open = el("button", { type: "button", "aria-label": (asset.safeFilename || asset.originalFilename) + (asset.mediaType === "PDF" ? " PDF’ini aç" : " önizle") }, asset.mediaType === "PDF" ? "PDF’i aç" : asset.mediaType === "AUDIO" ? "Dinle" : asset.mediaType === "VIDEO" ? "Oynat" : "Önizle");
    open.onclick = function () { previewController.open(asset, open); };
    card.append(visual, mark, name, meta, open); return card;
  }

  async function mount(options) {
    var collectionId = options.collectionId, grid = options.grid, previewHost = options.previewHost, status = options.status, onRendered = options.onRendered || function () {};
    previewHost.dataset.collectionId = collectionId;
    var previewController = createPreviewController(previewHost, refresh);
    async function refresh(focusId) {
      try {
        status.textContent = "Koleksiyon medyası yükleniyor.";
        var data = await apiRequest("/api/collections/" + encodeURIComponent(collectionId) + "/media");
        grid.querySelectorAll(".yd-media-card").forEach(function (card) { card.remove(); });
        data.media.forEach(function (asset) { grid.append(renderCard(asset, previewController, refresh)); }); onRendered();
        status.textContent = data.media.length + " medya gösteriliyor.";
        var targetCard = focusId ? [...grid.querySelectorAll(".yd-media-card")].find(function (card) { return card.dataset.mediaId === String(focusId); }) : null;
        if (targetCard) { targetCard.classList.add("is-new"); root.setTimeout(function () { targetCard.classList.remove("is-new"); }, 900); }
        return targetCard?.querySelector("button") || null;
      } catch (error) { status.textContent = error.message; return []; }
    }
    await refresh();
    return { refresh: refresh, openUpload: function (focus) { return uploadDialog(collectionId, function (asset) { return refresh(asset?.id); }, focus); }, destroy: previewController.destroy };
  }

  return Object.freeze({ POLICIES: POLICIES, STATES: STATES, formatBytes: formatBytes, validateFile: validateFile, errorState: errorState, stateMessage: stateMessage, createController: createController, createPreviewController: createPreviewController, uploadDialog: uploadDialog, renderCard: renderCard, mount: mount });
}));
