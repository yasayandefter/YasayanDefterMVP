(function () {
  "use strict";
  // Presentation of already-rendered personal data; no requests or new data model.
  function node(tag, className, text) {
    var result = document.createElement(tag); result.className = className || "";
    if (text !== undefined) result.textContent = text;
    return result;
  }
  var signature = "", presentedSources = [], scheduled = false;
  var presentedMap;
  function arrangeMap() {
    var host = document.querySelector('.yd-research-panel-map #knowledgeMap');
    var svg = host?.querySelector('.knowledge-map-svg');
    if (!svg || (presentedMap === svg && host.querySelector('.yd-map-compact'))) return;
    presentedMap = svg;
    host.querySelector('.yd-map-compact')?.remove();
    var list = node("div", "yd-map-compact");
    list.setAttribute("aria-label", svg.getAttribute("aria-label") || "Konu bağlantıları");
    svg.querySelectorAll('.knowledge-map-node').forEach(function (source) {
      var center = source.classList.contains("is-center");
      var item = node(center ? "p" : "button", center ? "yd-map-center" : "yd-map-link", source.getAttribute("aria-label") || source.textContent);
      if (!center) {
        item.type = "button";
        item.onclick = function () { if (source.isConnected) source.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
      }
      list.append(item);
    });
    host.append(list);
  }
  function arrangeProfile() {
    if (!document.documentElement.classList.contains("yd-auth-shell")) return;
    document.querySelectorAll('.yd-profile-fold').forEach(function (fold) { if (fold.children.length === 1) fold.remove(); });
    [["personalizationPanel", "Görünüm ve tema"], ["workspaceSettings", "Çalışma tercihlerin"], ["learningProgressPanel", "Konu ilerlemelerin"]].forEach(function (entry) {
      var panel = document.getElementById(entry[0]);
      if (!panel || panel.parentElement.classList.contains("yd-profile-fold")) return;
      var fold = node("details", "yd-profile-fold"), summary = node("summary", "", entry[1]);
      panel.before(fold); fold.append(summary, panel);
    });
  }
  function polishToolLabels() {
    if (!document.documentElement.classList.contains("yd-auth-shell")) return;
    document.querySelectorAll('.yd-research-panel:not(.yd-research-panel-overview) .section-title').forEach(function (title) {
      var text = title.textContent.replace(/^[^\p{L}\p{N}]+/u, "").trim();
      if (title.textContent !== text) title.textContent = text;
    });
    var quizMessage = document.getElementById("quizResult");
    if (quizMessage?.textContent === "Cevaplar server tarafından doğrulanır.") quizMessage.textContent = "Hazır olduğunda kendini test et.";
  }
  function renderPersonal() {
    var host = document.querySelector('[data-mount="personal"]');
    if (!host) return;
    var suggestions = Array.from(document.querySelectorAll("#homeIntelligence .home-context-item"));
    var saved = Array.from(document.querySelectorAll("#notebookList .smart-note-card"));
    var sources = (suggestions.length ? suggestions : saved).slice(0, 3);
    var next = JSON.stringify(sources.map(function (item) { return item.textContent; }));
    if (host.dataset.productReady && signature === next && sources.every(function (item, i) { return presentedSources[i] === item; })) return;
    signature = next; presentedSources = sources; host.dataset.productReady = "true";
    var continuity = document.querySelector(".yd-home-continuity");
    document.getElementById("ydHomeSavedContinuation")?.remove();
    if (continuity && !suggestions.length && saved.length) {
      var recent = node("div", "yd-home-saved-continuation"); recent.id = "ydHomeSavedContinuation";
      saved.slice(0, 3).forEach(function (item) {
        var title = item.querySelector(".saved-title")?.textContent;
        var button = node("button", "", title); button.type = "button";
        button.append(node("span", "", "Kaydına dön →"));
        button.onclick = function () { window.YDWorkspaceShell?.activate("notebook", false); item.querySelector(".yd-notebook-open")?.click(); };
        recent.append(button);
      });
      continuity.append(recent);
    }
    var section = node("section", "yd-personal-editorial");
    section.setAttribute("aria-label", suggestions.length ? "Sana uygun devam önerileri" : "Defterinden");
    section.append(node("p", "yd-eyebrow", suggestions.length ? "YENİDEN BAKMAYA DEĞER" : "DEFTERİNDEN"));
    section.append(node("h2", "yd-editorial", sources.length ? "Bir sonraki adımın" : "Şimdilik bir devam önerisi yok"));
    section.append(node("p", "yd-personal-lede", sources.length ? (suggestions.length ? "Kendi çalışmalarından, devam edebileceğin bağlantılar." : "Kaydettiğin konulara dön; kaldığın yerden devam et.") : "Notların ve araştırmaların biriktikçe, burada sana uygun devam önerileri göreceksin."));
    var list = node("div", "yd-personal-list");
    sources.forEach(function (item) {
      var row = node("article", "yd-personal-item");
      var title = item.querySelector(".saved-title, strong")?.textContent?.trim();
      var copy = node("div"); copy.append(node("h3", "", title));
      var reason = suggestions.length ? item.querySelector("p")?.textContent : item.querySelector(".saved-date")?.textContent;
      if (reason) copy.append(node("p", "", reason));
      var open = node("button", "yd-personal-open", "Devam et →"); open.type = "button";
      open.onclick = function () {
        window.YDWorkspaceShell?.activate("notebook", false);
        var action = item.querySelector(".home-context-cta, .yd-notebook-open");
        if (action?.isConnected) action.click();
      };
      row.append(copy, open); list.append(row);
    });
    if (!sources.length) {
      var start = node("button", "yd-personal-open", "Bir konu araştır →"); start.type = "button";
      start.onclick = function () { window.YDWorkspaceShell?.activate("research", true); };
      list.append(start);
    }
    section.append(list); host.replaceChildren(section);
  }
  function schedule() {
    if (scheduled) return; scheduled = true;
    requestAnimationFrame(function () { scheduled = false; arrangeProfile(); polishToolLabels(); arrangeMap(); renderPersonal(); });
  }
  document.addEventListener("DOMContentLoaded", function () {
    // Reveal the destination before the existing continuation handler focuses it.
    document.addEventListener("click", function (event) {
      if (event.target.closest?.('#yd-panel-home .home-context-cta')) window.YDWorkspaceShell?.activate("notebook", false);
    }, true);
    new MutationObserver(function (records) {
      if (records.some(function (record) {
        return !record.target.closest?.('[data-mount="personal"]') &&
          (record.target.closest?.("#workspaceHome,#notebookList,#commercialProfile,#knowledgeMap") || Array.from(record.addedNodes).some(function (n) { return n.id === "workspaceShell156"; }));
      })) schedule();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
  });
  window.addEventListener("workspace-shell:navigate", schedule);
  window.addEventListener("yasayan-auth-ready", schedule);
  window.addEventListener("research:completed", schedule);
}());
