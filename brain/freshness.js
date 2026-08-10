"use strict";

const WINDOWS = { day: 1, week: 7, month: 30, recent: 30, latest: 30 };

function normalize(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").replace(/[ıİ]/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const SIGNALS = [
  { pattern: /\bbugun\b|\bbugunku\b|\bsu an\b|\bsimdi\b|\btoday\b/, window: "day", weight: 1 },
  { pattern: /\bbu hafta\b|\bbu haftaki\b|\bthis week\b/, window: "week", weight: 1 },
  { pattern: /\bbu ay\b|\bthis month\b/, window: "month", weight: 1 },
  { pattern: /\bson durum\b|\bson gelism\w*\b|\ben son\b|\ben yeni\b|\bnear recent\b|\blatest\b|\bcurrent\b|\brecent\b|\bnewest\b/, window: "latest", weight: 1 },
  { pattern: /\bguncel\b|\bhaber\w*\b|\bson dakika\b|\bson deprem\b|\bbreaking\b|\bnews\b|\bson aciklama\b|\baciklandi mi\b|\bsonuclandi mi\b/, window: "recent", weight: 1 }
];

const CATEGORY_SIGNALS = {
  earthquake: /deprem|earthquake|sarsinti|fay hatt/,
  space: /mars|jupiter|uzay|astronomi|nasa|ay |gezegen|teleskop|space|planet|webb/,
  technology: /teknoloji|yapay zeka|yazilim|cihaz|telefon|samsung|teknoloji|robot|technology|software|device/,
  science: /bilim|fizik|kimya|biyoloji|crispr|genetik|science|physics|chemistry|biology/,
  education: /egitim|ogrenme|okul|universite|education|school|university/,
  health_general: /saglik|hastalik|diyabet|insulin|hipertansiyon|health|diabetes|medicine/,
  environment: /iklim|cevre|sel|yangin|environment|climate/,
  general: /.*/
};

function detectCategory(query) {
  const text = normalize(query);
  for (const category of ["earthquake", "space", "technology", "science", "education", "health_general", "environment"]) {
    if (CATEGORY_SIGNALS[category].test(text)) return category;
  }
  return "general";
}

function detectFreshness(query, now = new Date()) {
  const text = normalize(query);
  const matched = SIGNALS.filter(signal => signal.pattern.test(text));
  const hasYear = /\b(?:19|20)\d{2}\b/.test(text);
  const currentYear = String(now.getFullYear());
  const hasCurrentYear = text.includes(currentYear);
  const requiresFreshness = matched.length > 0 || (hasCurrentYear && /guncel|son|haber|current|latest|today/.test(text));
  const primary = matched[0];
  return {
    requiresFreshness,
    mode: requiresFreshness ? "current" : "standard",
    confidence: requiresFreshness ? Math.min(1, 0.72 + matched.length * 0.08) : 0.98,
    signals: matched.map(signal => signal.pattern.source),
    requestedWindow: primary?.window || (requiresFreshness ? "latest" : null),
    category: detectCategory(query),
    hasYear,
    detectedAt: now.toISOString()
  };
}

module.exports = { WINDOWS, normalize, detectFreshness, detectCategory };
