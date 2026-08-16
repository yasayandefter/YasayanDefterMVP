(function () {
  "use strict";

  var state = { production: false, authenticated: false, user: null, demo: true };
  var shell;
  var returnFocus = null;
  var nativeFetch = window.fetch.bind(window);
  var publicHeadersInstalled = false;

  window.YasayanDefterAccess = {
    isDemoMode: function () { return state.demo === true; },
    canUsePersistentApi: function () { return state.demo !== true && (state.authenticated === true || window.YasayanDefterAuth?.local === true); }
  };

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "class") node.className = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function message(form, text, kind) {
    var target = form.querySelector("[data-auth-message]");
    target.textContent = text || "";
    target.className = "auth-message " + (kind || "");
  }

  async function request(path, options) {
    var response = await fetch(path, Object.assign({ credentials: "same-origin", headers: { Accept: "application/json" } }, options || {}));
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(payload && payload.error && payload.error.message || "İşlem şu anda tamamlanamadı.");
      error.code = payload && payload.error && payload.error.code || "REQUEST_FAILED";
      throw error;
    }
    return payload;
  }

  function field(label, name, type, autocomplete) {
    var wrap = el("div", { class: "auth-field" });
    var id = "auth-" + name;
    wrap.appendChild(el("label", { for: id }, label));
    wrap.appendChild(el("input", { id: id, name: name, type: type, autocomplete: autocomplete, required: "", maxlength: "240" }));
    return wrap;
  }

  function loginForm() {
    var form = el("form", { class: "auth-form", "data-login-form": "", novalidate: "" });
    form.appendChild(el("p", { class: "auth-kicker" }, "Öğrenme yolculuğun"));
    form.appendChild(el("h1", {}, "Yaşayan Defter'e Giriş"));
    form.appendChild(el("p", { class: "auth-lede" }, "Araştırmalarına, hafızana ve öğrenme yolculuğuna kaldığın yerden devam et."));
    form.appendChild(field("Kullanıcı adı veya e-posta", "identifier", "text", "username"));
    form.appendChild(field("Parola", "password", "password", "current-password"));
    var submit = el("button", { type: "submit", class: "auth-primary" }, "Giriş yap");
    form.appendChild(submit);
    form.appendChild(el("p", { class: "auth-message", role: "status", "aria-live": "polite", "data-auth-message": "" }));
    var actions = el("div", { class: "auth-secondary-actions" });
    var forgot = el("button", { type: "button", class: "auth-link", "data-show-password-reset": "" }, "Parolamı unuttum");
    var register = el("button", { type: "button", class: "auth-link", "data-show-register": "" }, "Hesabın yok mu? Hesap oluştur");
    var demo = el("button", { type: "button", class: "auth-demo", "data-open-demo": "" }, "Yaşayan Defter'i önce keşfetmek ister misin? Demoyu aç");
    var claim = el("button", { type: "button", class: "auth-link", "data-show-claim": "", "data-open-claim": "" }, "Okul veya sınıfa mı katılıyorsun? Davet kodunu kullan");
    actions.append(forgot, register, demo, claim); form.appendChild(actions);
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true; submit.textContent = "Giriş yapılıyor…"; message(form, "", "");
      try {
        var data = new FormData(form);
        var payload = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ identifier: data.get("identifier"), password: data.get("password") }) });
        window.YasayanDefterAuth = { authenticated: true, user: payload.user };
        window.location.reload();
      } catch (error) { message(form, error.message, "is-error"); }
      finally { submit.disabled = false; submit.textContent = "Giriş yap"; }
    });
    register.addEventListener("click", renderRegister);
    forgot.addEventListener("click", renderForgotPassword);
    demo.addEventListener("click", activateDemo);
    claim.addEventListener("click", function () { renderClaim(); });
    return form;
  }

  function registerForm() {
    var form = el("form", { class: "auth-form", "data-register-form": "", novalidate: "" });
    form.appendChild(el("p", { class: "auth-kicker" }, "Bireysel hesap"));
    form.appendChild(el("h1", {}, "Hesap oluştur"));
    form.appendChild(el("p", { class: "auth-lede" }, "Okul veya sınıf bağlantısı olmadan kendi öğrenme alanını oluştur."));
    form.appendChild(field("Kullanıcı adı", "username", "text", "username"));
    var emailField = field("E-posta (opsiyonel)", "email", "email", "email"); emailField.querySelector("input").removeAttribute("required"); form.appendChild(emailField);
    form.appendChild(field("Parola", "newPassword", "password", "new-password"));
    form.appendChild(field("Parola tekrar", "confirmPassword", "password", "new-password"));
    var submit = el("button", { type: "submit", class: "auth-primary" }, "Hesap oluştur"); form.appendChild(submit);
    form.appendChild(el("p", { class: "auth-message", role: "status", "aria-live": "polite", "data-auth-message": "" }));
    var back = el("button", { type: "button", class: "auth-link" }, "Giriş ekranına dön"); form.appendChild(back); back.addEventListener("click", renderLogin);
    form.addEventListener("submit", async function (event) {
      event.preventDefault(); if (!form.reportValidity()) return; var data = new FormData(form);
      if (data.get("newPassword") !== data.get("confirmPassword")) { message(form, "Parolalar eşleşmiyor.", "is-error"); return; }
      submit.disabled = true; message(form, "", "");
      try { var payload = await request("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ username: data.get("username"), email: data.get("email"), password: data.get("newPassword") }) }); activate(payload.user); }
      catch (error) { message(form, error.message, "is-error"); }
      finally { submit.disabled = false; }
    });
    return form;
  }

  function claimForm() {
    var form = el("form", { class: "auth-form", "data-claim-form": "", novalidate: "" });
    form.appendChild(el("p", { class: "auth-kicker" }, "Okul / Sınıfa Katıl"));
    form.appendChild(el("h1", {}, "Davet kodunu kullan"));
    form.appendChild(el("p", { class: "auth-lede" }, "Okulun veya öğretmenin tarafından verilen davet/claim kodunu kullan."));
    form.appendChild(field("Davet / claim kodu", "claimCode", "text", "one-time-code"));
    form.appendChild(field("Kullanıcı adı", "username", "text", "username"));
    form.appendChild(field("Parola", "newPassword", "password", "new-password"));
    form.appendChild(field("Parola tekrar", "confirmPassword", "password", "new-password"));
    var submit = el("button", { type: "submit", class: "auth-primary" }, "Hesabımı oluştur");
    form.appendChild(submit);
    form.appendChild(el("p", { class: "auth-message", role: "status", "aria-live": "polite", "data-auth-message": "" }));
    var back = el("button", { type: "button", class: "auth-link" }, "Giriş ekranına dön");
    form.appendChild(back);
    back.addEventListener("click", renderLogin);
    form.addEventListener("submit", async function (event) {
      event.preventDefault(); if (!form.reportValidity()) return;
      var data = new FormData(form);
      if (data.get("newPassword") !== data.get("confirmPassword")) { message(form, "Parolalar eşleşmiyor.", "is-error"); return; }
      submit.disabled = true; submit.textContent = "Hesap oluşturuluyor…"; message(form, "", "");
      try {
        var payload = await request("/api/auth/claim", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ claimCode: data.get("claimCode"), username: data.get("username"), password: data.get("newPassword") }) });
        message(form, "Hesabın oluşturuldu. Yönlendiriliyorsun…", "is-success");
        window.setTimeout(function () { window.location.reload(); }, 350);
      } catch (error) { message(form, error.message, "is-error"); }
      finally { submit.disabled = false; submit.textContent = "Hesabımı oluştur"; }
    });
    return form;
  }

  function profileForm() {
    var user = state.user || {};
    var form = el("form", { class: "auth-form", "data-profile-form": "", novalidate: "" });
    form.appendChild(el("p", { class: "auth-kicker" }, "Hesap ayarları"));
    form.appendChild(el("h1", {}, "Profili düzenle"));
    form.appendChild(el("p", { class: "auth-lede" }, "Hesap bilgilerinizi güncellemek için mevcut parolanızı girin."));
    var usernameField = field("Kullanıcı adı", "profileUsername", "text", "username"); usernameField.querySelector("input").value = user.username || ""; form.appendChild(usernameField);
    var emailField = field("E-posta (opsiyonel)", "profileEmail", "email", "email"); emailField.querySelector("input").removeAttribute("required"); emailField.querySelector("input").value = user.email || ""; form.appendChild(emailField);
    var displayField = field("Görünen ad (opsiyonel)", "profileDisplayName", "text", "name"); displayField.querySelector("input").removeAttribute("required"); displayField.querySelector("input").value = user.displayName || ""; form.appendChild(displayField);
    form.appendChild(field("Mevcut parola", "currentPassword", "password", "current-password"));
    var actions = el("div", { class: "auth-form-actions" });
    var cancel = el("button", { type: "button", class: "auth-link" }, "Vazgeç");
    var submit = el("button", { type: "submit", class: "auth-primary" }, "Kaydet");
    actions.append(cancel, submit); form.appendChild(actions);
    form.appendChild(el("p", { class: "auth-message", role: "status", "aria-live": "polite", "data-auth-message": "" }));
    cancel.addEventListener("click", closeAuth);
    form.addEventListener("submit", async function (event) {
      event.preventDefault(); if (!form.reportValidity()) return;
      submit.disabled = true; message(form, "", ""); var data = new FormData(form);
      try {
        var payload = await request("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ username: data.get("profileUsername"), email: data.get("profileEmail"), displayName: data.get("profileDisplayName"), currentPassword: data.get("currentPassword") }) });
        state.user = payload.user; window.YasayanDefterAuth = { authenticated: true, user: payload.user };
        var badgeName = document.querySelector("[data-auth-user] span"); if (badgeName) badgeName.textContent = payload.user.displayName || payload.user.username || payload.user.email || "Hesap";
        window.dispatchEvent(new CustomEvent("yasayan-profile-updated", { detail: payload.user }));
        message(form, "Profiliniz güncellendi.", "is-success"); window.setTimeout(closeAuth, 700);
      } catch (error) { message(form, error.message, "is-error"); }
      finally { submit.disabled = false; }
    });
    return form;
  }

  function passwordForm() {
    var form = el("form", { class: "auth-form", "data-password-form": "", novalidate: "" });
    form.appendChild(el("p", { class: "auth-kicker" }, "Hesap güvenliği"));
    form.appendChild(el("h1", {}, "Parolayı değiştir"));
    form.appendChild(el("p", { class: "auth-lede" }, "Parolanızı değiştirdiğinizde bu oturum açık kalır, diğer aktif oturumlar kapatılır."));
    form.appendChild(field("Mevcut parola", "passwordCurrent", "password", "current-password"));
    form.appendChild(field("Yeni parola", "passwordNew", "password", "new-password"));
    form.appendChild(field("Yeni parola tekrar", "passwordConfirm", "password", "new-password"));
    var actions = el("div", { class: "auth-form-actions" });
    var cancel = el("button", { type: "button", class: "auth-link" }, "Vazgeç");
    var submit = el("button", { type: "submit", class: "auth-primary" }, "Parolayı değiştir");
    actions.append(cancel, submit); form.appendChild(actions);
    form.appendChild(el("p", { class: "auth-message", role: "status", "aria-live": "polite", "data-auth-message": "" }));
    cancel.addEventListener("click", closeAuth);
    form.addEventListener("submit", async function (event) {
      event.preventDefault(); if (!form.reportValidity()) return;
      var data = new FormData(form);
      if (data.get("passwordNew") !== data.get("passwordConfirm")) { message(form, "Yeni parolalar eşleşmiyor.", "is-error"); return; }
      submit.disabled = true; message(form, "", "");
      try {
        var payload = await request("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ currentPassword: data.get("passwordCurrent"), newPassword: data.get("passwordNew") }) });
        message(form, payload.message || "Parolanız başarıyla değiştirildi.", "is-success");
        window.setTimeout(closeAuth, 900);
      } catch (error) { message(form, error.message || "Parola değiştirilemedi.", "is-error"); }
      finally { submit.disabled = false; }
    });
    return form;
  }

  function forgotPasswordForm() {
    var form = el("form", { class: "auth-form", "data-forgot-password-form": "", novalidate: "" });
    form.appendChild(el("p", { class: "auth-kicker" }, "Hesap kurtarma"));
    form.appendChild(el("h1", {}, "Parolanızı sıfırlayın"));
    form.appendChild(el("p", { class: "auth-lede" }, "Hesabınızla ilişkili kullanıcı adı veya e-posta adresini girin."));
    form.appendChild(field("Kullanıcı adı veya e-posta", "resetIdentifier", "text", "username"));
    var actions = el("div", { class: "auth-form-actions" }); var cancel = el("button", { type: "button", class: "auth-link" }, "Vazgeç"); var submit = el("button", { type: "submit", class: "auth-primary" }, "Gönder");
    actions.append(cancel, submit); form.appendChild(actions); form.appendChild(el("p", { class: "auth-message", role: "status", "aria-live": "polite", "data-auth-message": "" }));
    cancel.addEventListener("click", renderLogin);
    form.addEventListener("submit", async function (event) {
      event.preventDefault(); if (!form.reportValidity()) return; submit.disabled = true; message(form, "", "");
      try { var data = new FormData(form); var payload = await request("/api/auth/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ identifier: data.get("resetIdentifier") }) }); message(form, payload.message, "is-success"); }
      catch (error) { message(form, error.message || "İstek şu anda tamamlanamadı.", "is-error"); }
      finally { submit.disabled = false; }
    });
    return form;
  }

  function resetPasswordForm(token) {
    var form = el("form", { class: "auth-form", "data-reset-password-form": "", novalidate: "" });
    form.appendChild(el("p", { class: "auth-kicker" }, "Hesap kurtarma")); form.appendChild(el("h1", {}, "Yeni parola belirleyin"));
    form.appendChild(el("p", { class: "auth-lede" }, "Yeni parolanız en az 8 karakter olmalıdır."));
    form.appendChild(field("Yeni parola", "resetPassword", "password", "new-password")); form.appendChild(field("Yeni parola tekrar", "resetPasswordConfirm", "password", "new-password"));
    var actions = el("div", { class: "auth-form-actions" }); var cancel = el("button", { type: "button", class: "auth-link" }, "Vazgeç"); var submit = el("button", { type: "submit", class: "auth-primary" }, "Parolayı sıfırla");
    actions.append(cancel, submit); form.appendChild(actions); form.appendChild(el("p", { class: "auth-message", role: "status", "aria-live": "polite", "data-auth-message": "" }));
    cancel.addEventListener("click", renderLogin);
    form.addEventListener("submit", async function (event) {
      event.preventDefault(); if (!form.reportValidity()) return; var data = new FormData(form);
      if (data.get("resetPassword") !== data.get("resetPasswordConfirm")) { message(form, "Yeni parolalar eşleşmiyor.", "is-error"); return; }
      submit.disabled = true; message(form, "", "");
      try { var payload = await request("/api/auth/password-reset/complete", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ token: token, newPassword: data.get("resetPassword") }) }); message(form, payload.message, "is-success"); window.setTimeout(function () { window.location.reload(); }, 900); }
      catch (error) { message(form, error.message || "Parola sıfırlanamadı.", "is-error"); }
      finally { submit.disabled = false; }
    });
    return form;
  }

  function setPublicActionsHidden(hidden) {
    document.querySelectorAll(".auth-public-actions").forEach(function (node) { node.remove(); });
    if (!hidden && state.demo === true) { var header = document.querySelector(".landing-header") || document.querySelector(".header"); if (header) header.appendChild(accountActions()); }
  }
  function closeAuth() {
    shell.hidden = true;
    var focusTarget = returnFocus;
    var replacementSelector = focusTarget?.hasAttribute("data-open-login") ? "[data-open-login]" : focusTarget?.hasAttribute("data-open-register") ? "[data-open-register]" : focusTarget?.hasAttribute("data-open-claim") ? "[data-open-claim]" : "";
    setPublicActionsHidden(false);
    if (!focusTarget?.isConnected && replacementSelector) focusTarget = document.querySelector(replacementSelector);
    if (focusTarget?.isConnected) focusTarget.focus();
    returnFocus = null;
  }
  function addCloseButton(form) {
    var close = el("button", { type: "button", class: "auth-close", "aria-label": "Hesap penceresini kapat" }, "×");
    close.addEventListener("click", closeAuth); form.prepend(close); return form;
  }
  function showAuth(form) { if (shell.hidden) returnFocus = document.activeElement; setPublicActionsHidden(true); shell.hidden = false; shell.querySelector(".auth-card").replaceChildren(addCloseButton(form)); window.setTimeout(function () { (shell.querySelector("input:not([disabled])") || shell.querySelector("button:not([disabled])"))?.focus(); }, 0); }
  function renderLogin() { showAuth(loginForm()); }
  function renderRegister() { showAuth(registerForm()); }
  function renderClaim() { showAuth(claimForm()); }
  function renderProfile() { if (state.authenticated && state.user) showAuth(profileForm()); }
  function renderPassword() { if (state.authenticated && state.user) showAuth(passwordForm()); }
  function renderForgotPassword() { showAuth(forgotPasswordForm()); }
  function renderResetPassword(token) { showAuth(resetPasswordForm(token)); }
  window.addEventListener("yasayan-open-profile", renderProfile);
  window.addEventListener("yasayan-open-password", renderPassword);

  function applyAccessVisibility(role) {
    document.documentElement.dataset.accessMode = role === "DEMO" ? "demo" : String(role || "user").toLowerCase();
    document.querySelectorAll('[data-classroom="true"], #teacherDashboard, #classroomDashboard').forEach(function (node) { if (role !== "TEACHER") node.hidden = true; });
  }

  function installPublicHeaders() {
    if (publicHeadersInstalled) return;
    publicHeadersInstalled = true;
    var demoSession = sessionStorage.getItem("yasayan-defter-public-session") || (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    sessionStorage.setItem("yasayan-defter-public-session", demoSession);
    window.fetch = function (input, options) {
      var next = Object.assign({}, options || {}); next.headers = new Headers(next.headers || {});
      if (state.demo === true) { next.headers.set("X-Demo-Mode", "true"); next.headers.set("X-Demo-Session", demoSession); }
      return nativeFetch(input, next);
    };
  }

  function accountActions() {
    var actions = el("div", { class: "auth-user auth-public-actions", "data-auth-user": "" });
    var login = el("button", { type: "button", "data-open-login": "" }, "Giriş Yap");
    var register = el("button", { type: "button", "data-open-register": "", "aria-label": "Hesap oluştur" }, "Hesap Oluştur");
    var claim = el("button", { type: "button", "data-open-claim": "" }, "Okul / Sınıfa Katıl");
    login.addEventListener("click", renderLogin);
    register.addEventListener("click", renderRegister);
    claim.addEventListener("click", renderClaim);
    actions.append(login, register, claim); return actions;
  }

  function activateDemo() {
    state.authenticated = false; state.user = null; state.demo = true;
    installPublicHeaders();
    document.documentElement.classList.remove("auth-locked"); shell.hidden = true; applyAccessVisibility("DEMO");
    document.querySelectorAll("[data-auth-user]").forEach(function (node) { node.remove(); });
    var header = document.querySelector(".landing-header") || document.querySelector(".header"); if (header) header.appendChild(accountActions());
    window.YasayanDefterAuth = { demo: true, public: true, authenticated: false, user: null };
    window.dispatchEvent(new CustomEvent("yasayan-auth-ready", { detail: window.YasayanDefterAuth }));
  }

  function activate(user) {
    state.authenticated = true; state.user = user || null; state.demo = false;
    document.documentElement.classList.remove("auth-locked");
    shell.hidden = true;
    var badge = document.querySelector("[data-auth-user]");
    if (!badge) {
      badge = el("div", { class: "auth-user", "data-auth-user": "" });
      var header = document.querySelector(".header"); if (header) header.appendChild(badge);
    }
    badge.hidden = false; badge.className = "auth-user";
    badge.replaceChildren(el("span", {}, (user && (user.displayName || user.username || user.email)) || "Hesap"));
    var logout = el("button", { type: "button" }, "Çıkış yap");
    logout.addEventListener("click", async function () { logout.disabled = true; try { await request("/api/auth/logout", { method: "POST" }); } finally { window.location.reload(); } });
    badge.appendChild(logout);
    window.YasayanDefterAuth = { authenticated: true, user: user };
    applyAccessVisibility(user && user.role);
    window.dispatchEvent(new CustomEvent("yasayan-auth-ready", { detail: window.YasayanDefterAuth }));
  }

  async function init() {
    var resetPrefix = "#reset-password="; var pendingResetToken = window.location.hash.startsWith(resetPrefix) ? decodeURIComponent(window.location.hash.slice(resetPrefix.length)) : "";
    if (pendingResetToken) history.replaceState(null, "", window.location.pathname + window.location.search);
    shell = el("section", { class: "auth-shell", "aria-label": "Hesap erişimi", hidden: "" });
    var backdrop = el("div", { class: "auth-backdrop", "aria-hidden": "true" }); backdrop.addEventListener("click", closeAuth); shell.appendChild(backdrop);
    shell.appendChild(el("div", { class: "auth-card", role: "dialog", "aria-modal": "true", "aria-label": "Hesap erişimi" }));
    document.body.prepend(shell);
    document.addEventListener("keydown", function (event) {
      if (shell.hidden) return;
      if (event.key === "Escape") { event.preventDefault(); closeAuth(); return; }
      if (event.key !== "Tab") return;
      var focusable = Array.from(shell.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter(function (node) { return !node.hidden; });
      if (!focusable.length) return;
      var first = focusable[0]; var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    try {
      var session = await request("/api/auth/session");
      state.production = true;
      if (session.authenticated) activate(session.user); else activateDemo();
      if (pendingResetToken) renderResetPassword(pendingResetToken);
    } catch (error) {
      if (error.code === "AUTH_DISABLED") { shell.remove(); window.YasayanDefterAuth = { local: true }; }
      else { activateDemo(); if (pendingResetToken) renderResetPassword(pendingResetToken); }
    }
  }

  init();
})();
