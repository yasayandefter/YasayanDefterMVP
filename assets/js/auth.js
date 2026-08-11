(function () {
  "use strict";

  var state = { production: false, authenticated: false, user: null };
  var shell;

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
    form.appendChild(el("p", { class: "auth-kicker" }, "Güvenli hesap erişimi"));
    form.appendChild(el("h1", {}, "Yaşayan Defter'e giriş"));
    form.appendChild(el("p", { class: "auth-lede" }, "Öğretmenler e-posta, öğrenciler kullanıcı adı ile giriş yapabilir."));
    form.appendChild(field("Kullanıcı adı veya e-posta", "identifier", "text", "username"));
    form.appendChild(field("Parola", "password", "password", "current-password"));
    var submit = el("button", { type: "submit", class: "auth-primary" }, "Giriş yap");
    form.appendChild(submit);
    form.appendChild(el("p", { class: "auth-message", role: "status", "aria-live": "polite", "data-auth-message": "" }));
    var claim = el("button", { type: "button", class: "auth-link", "data-show-claim": "" }, "İlk kez mi geliyorsun? Öğrenci hesabını oluştur");
    form.appendChild(claim);
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
    claim.addEventListener("click", function () { renderClaim(); });
    return form;
  }

  function claimForm() {
    var form = el("form", { class: "auth-form", "data-claim-form": "", novalidate: "" });
    form.appendChild(el("p", { class: "auth-kicker" }, "Öğrenci hesabı"));
    form.appendChild(el("h1", {}, "Profilini sahiplen"));
    form.appendChild(el("p", { class: "auth-lede" }, "Öğretmeninden aldığın claim koduyla güvenli hesabını oluştur."));
    form.appendChild(field("Claim kodu", "claimCode", "text", "one-time-code"));
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

  function renderLogin() { shell.querySelector(".auth-card").replaceChildren(loginForm()); }
  function renderClaim() { shell.querySelector(".auth-card").replaceChildren(claimForm()); }

  function activate(user) {
    state.authenticated = true; state.user = user || null;
    document.documentElement.classList.remove("auth-locked");
    shell.hidden = true;
    var badge = document.querySelector("[data-auth-user]");
    if (!badge) {
      badge = el("div", { class: "auth-user", "data-auth-user": "" });
      var header = document.querySelector(".header"); if (header) header.appendChild(badge);
    }
    badge.replaceChildren(el("span", {}, (user && (user.displayName || user.username || user.email)) || "Hesap"));
    var logout = el("button", { type: "button" }, "Çıkış yap");
    logout.addEventListener("click", async function () { logout.disabled = true; try { await request("/api/auth/logout", { method: "POST" }); } finally { state.authenticated = false; state.user = null; badge.remove(); lock(); } });
    badge.appendChild(logout);
    window.YasayanDefterAuth = { authenticated: true, user: user };
    window.dispatchEvent(new CustomEvent("yasayan-auth-ready", { detail: window.YasayanDefterAuth }));
  }

  function lock() {
    document.documentElement.classList.add("auth-locked"); shell.hidden = false; renderLogin();
    window.YasayanDefterAuth = { authenticated: false, user: null };
  }

  async function init() {
    shell = el("section", { class: "auth-shell", "aria-label": "Hesap erişimi" });
    shell.appendChild(el("div", { class: "auth-backdrop", "aria-hidden": "true" }));
    shell.appendChild(el("div", { class: "auth-card" }));
    document.body.prepend(shell);
    try {
      var session = await request("/api/auth/session");
      state.production = true;
      if (session.authenticated) activate(session.user); else lock();
    } catch (error) {
      if (error.code === "AUTH_DISABLED") { shell.remove(); window.YasayanDefterAuth = { local: true }; }
      else lock();
    }
  }

  init();
})();
