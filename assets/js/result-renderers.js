(function (global) {
  "use strict";

  var LEVELS = ["high", "medium", "limited", "low"];

  function text(value) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001F]/g, " ").trim() : "";
  }

  function safeUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var decoded = raw;
    for (var i = 0; i < 2; i += 1) {
      try {
        var next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch (_) {
        break;
      }
    }
    var dangerous = decoded.replace(/^\s+/, "").toLowerCase();
    if (/^(javascript|data|vbscript):/.test(dangerous) || dangerous.indexOf("//") === 0) return "";
    if (!/^https?:\/\//i.test(raw)) return "";
    try {
      var url = new URL(raw);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function confidenceLabel(value) {
    var level = LEVELS.indexOf(String(value || "").toLowerCase()) >= 0 ? String(value).toLowerCase() : "limited";
    return {
      high: "Güçlü kaynak desteği",
      medium: "Orta düzey kaynak desteği",
      limited: "Sınırlı kaynak desteği",
      low: "Düşük kaynak desteği"
    }[level];
  }

  function uniqueStrings(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : []).map(text).filter(function (value) {
      var key = value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function followUpItems(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : []).map(function (item) {
      var label = typeof item === "string" ? text(item) : text(item && (item.text || item.question || item.title));
      var query = typeof item === "string" ? label : text(item && (item.query || item.searchQuery)) || label;
      return { text: label, query: query };
    }).filter(function (item) {
      var key = item.text.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (!key || !item.query || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }

  function finiteScore(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function buildResultViewModel(data) {
    data = data && typeof data === "object" ? data : {};
    var structured = data.structuredContent && typeof data.structuredContent === "object" ? data.structuredContent : {};
    var articles = Array.isArray(data.articles) ? data.articles.filter(Boolean).slice(0, 20) : [];
    var images = Array.isArray(data.images) ? data.images.filter(Boolean).slice(0, 12) : [];
    var summary = text(structured.summary || data.text || data.summary);
    var introduction = text(structured.introduction);
    var sections = Array.isArray(structured.sections) ? structured.sections.filter(function (section) {
      var sectionText = text(section && section.text);
      return section && (text(section.title) || sectionText) && sectionText !== summary && sectionText !== introduction;
    }).slice(0, 8) : [];
    var concepts = Array.isArray(structured.keyConcepts) ? structured.keyConcepts.filter(function (item) { return item && text(item.term); }).slice(0, 8) : [];
    var facts = Array.isArray(structured.keyFacts) ? structured.keyFacts.filter(function (item) { return item && text(item.text); }).slice(0, 8) : [];
    var questions = followUpItems(data.followUpQuestions || structured.followUpQuestions).slice(0, 4);
    var limitations = uniqueStrings((structured.limitations || []).concat(structured.contentWarnings || [])).slice(0, 6);
    return {
      title: text(data.title || data.query || "Araştırma sonucu"),
      query: text(data.query),
      summary: summary,
      introduction: introduction,
      audienceLevel: text(structured.audienceLevel || "general") || "general",
      usedFallback: Boolean(structured.generatedFrom && structured.generatedFrom.usedFallback),
      sections: sections,
      concepts: concepts,
      facts: facts,
      timeline: Array.isArray(structured.timeline || data.timeline) ? (structured.timeline || data.timeline).filter(Boolean).slice(0, 10) : [],
      comparison: structured.comparison || data.comparison || null,
      interestingFacts: uniqueStrings(structured.interestingFacts).slice(0, 4),
      questions: questions,
      limitations: limitations,
      articles: articles,
      images: images,
      sources: uniqueStrings(data.sources),
      reliability: data.reliability && typeof data.reliability === "object" ? data.reliability : null,
      intent: text(data.intent || structured.intent),
      mode: text(data.mode || structured.mode || data.researchMode),
      checkedAt: text(data.checkedAt || structured.checkedAt),
      score: finiteScore(data.reliability && data.reliability.score),
      finiteScore: finiteScore,
      safeImage: safeUrl(data.image || (images[0] && (images[0].image || images[0].url))),
      safeUrl: safeUrl,
      confidenceLabel: confidenceLabel
    };
  }

  global.ResultRenderers = { safeUrl: safeUrl, confidenceLabel: confidenceLabel, followUpItems: followUpItems, buildResultViewModel: buildResultViewModel };
}(window));
