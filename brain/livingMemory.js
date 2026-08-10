const crypto = require("node:crypto");
const fs = require("node:fs");

const REVIEW_INTERVALS = [1, 3, 7, 30];
const LIMITS = Object.freeze({
  records: 1000,
  concepts: 40,
  facts: 40,
  relatedTopics: 40,
  connections: 5000,
  history: 200,
  recentTopics: 10,
  text: 12000
});
const TOPIC_GROUPS = [
  ["mars", "gezegenler", "jüpiter", "jupiter", "dünya", "dunya"],
  ["atom", "elektron", "proton", "kuantum", "kuantum fiziği", "kuantum fizigi"],
  ["dna", "gen", "rna", "protein", "hücre", "hucre"],
  ["diyabet", "insülin", "insulin", "glukoz", "metabolizma"]
];

function recoverAtomicFile(file) {
  const backup = `${file}.bak`;
  try {
    let primaryValid = false;
    if (fs.existsSync(file)) {
      try { JSON.parse(fs.readFileSync(file, "utf8")); primaryValid = true; } catch (_) {}
    }
    if (!primaryValid && fs.existsSync(backup)) {
      try { JSON.parse(fs.readFileSync(backup, "utf8")); fs.copyFileSync(backup, file); } catch (_) {}
    }
  } catch (_) {
    // Reads remain safe; callers receive their normal fallback if recovery fails.
  }
}

function writeJSONAtomic(file, data) {
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const backup = `${file}.bak`;
  let movedOriginal = false;
  try {
    const descriptor = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(descriptor, JSON.stringify(data, null, 2), "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (fs.existsSync(file)) {
      if (fs.existsSync(backup)) fs.unlinkSync(backup);
      fs.renameSync(file, backup);
      movedOriginal = true;
    }
    fs.renameSync(temporary, file);
    // Keep the last known-good backup for crash recovery.
    return true;
  } catch (_) {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      if (movedOriginal && !fs.existsSync(file) && fs.existsSync(backup)) fs.renameSync(backup, file);
    } catch (_) {
      // Preserve the original error boundary without masking application flow.
    }
    return false;
  }
}

function text(value) {
  const output = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (/^(\[object Object\]|undefined|null|error|stack)$/i.test(output)) return "";
  return output.slice(0, LIMITS.text);
}

function normalize(value) {
  return text(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKC")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => {
    if (value && typeof value === "object") {
      return text(value.text || value.topic || value.title || value.question || value.label);
    }
    return text(value);
  }).filter(Boolean))].slice(0, LIMITS.relatedTopics);
}

function safeRelated(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map(value => {
    if (value && typeof value === "object") {
      const title = text(value.title || value.topic || value.question || value.text);
      const key = normalize(title);
      if (!title || seen.has(key)) return null;
      seen.add(key);
      return {
        title,
        text: text(value.text),
        image: text(value.image),
        url: text(value.url),
        source: text(value.source) || "Brain Engine"
      };
    }
    const title = text(value);
    const key = normalize(title);
    if (!title || seen.has(key)) return null;
    seen.add(key);
    return { title, text: "", image: "", url: "", source: "Brain Engine" };
  }).filter(Boolean).slice(0, LIMITS.relatedTopics);
}

function validDate(value, fallback) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

function stableId(topic) {
  return `memory-${crypto.createHash("sha1").update(normalize(topic)).digest("hex").slice(0, 16)}`;
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeRecord(item) {
  if (!item || typeof item !== "object") return null;
  const topic = text(item.topic || item.title);
  if (!topic) return null;
  const now = "1970-01-01T00:00:00.000Z";
  return {
    ...item,
    id: text(item.id) || stableId(topic),
    topic,
    createdAt: validDate(item.createdAt || item.lastSearched, now),
    updatedAt: validDate(item.updatedAt || item.lastSearched || item.createdAt, now),
    keyConcepts: uniqueStrings(item.keyConcepts || item.keywords).slice(0, LIMITS.concepts),
    keyFacts: uniqueStrings(item.keyFacts || item.facts).slice(0, LIMITS.facts),
    relatedTopics: uniqueStrings(item.relatedTopics || item.related).slice(0, LIMITS.relatedTopics),
    related: safeRelated(item.related || item.relatedTopics),
    reliabilitySummary: item.reliabilitySummary && typeof item.reliabilitySummary === "object"
      ? { ...item.reliabilitySummary }
      : { score: numeric(item.confidence), sourceCount: numeric(item.sourceCount) },
    confidence: numeric(item.confidence),
    sourceCount: numeric(item.sourceCount, Array.isArray(item.sources) ? item.sources.length : 0),
    audienceLevel: text(item.audienceLevel) || "general",
    timesSearched: Math.max(1, numeric(item.timesSearched, 1))
  };
}

function sanitizeRecords(items) {
  const byTopic = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const record = sanitizeRecord(item);
    if (!record) continue;
    const key = `${text(record.studentId)}::${normalize(record.topic)}`;
    const previous = byTopic.get(key);
    if (!previous || new Date(record.updatedAt) >= new Date(previous.updatedAt)) {
      byTopic.set(key, previous ? { ...previous, ...record } : record);
    }
  }
  return [...byTopic.values()]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt) || normalize(a.topic).localeCompare(normalize(b.topic)))
    .slice(0, LIMITS.records);
}

function buildEntry(result, previous, now = new Date()) {
  const topic = text(result?.analysis?.topic || result?.title || result?.query);
  if (!topic) return null;
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const structured = result.structuredContent || {};
  const reliability = result.reliability && typeof result.reliability === "object" ? result.reliability : {};
  const concepts = uniqueStrings(structured.keyConcepts || result.analysis?.keywords);
  const facts = uniqueStrings(structured.keyFacts || result.brain?.facts);
  const relatedTopics = uniqueStrings([
    ...(Array.isArray(result.analysis?.relatedTopics) ? result.analysis.relatedTopics : []),
    ...(Array.isArray(result.related) ? result.related : [])
  ]).filter(value => normalize(value) !== normalize(topic));
  const confidence = numeric(result.confidence, numeric(reliability.score));
  return {
    ...(previous || {}),
    id: previous?.id || stableId(topic),
    topic,
    createdAt: validDate(previous?.createdAt, timestamp),
    updatedAt: timestamp,
    keyConcepts: (concepts.length ? concepts : uniqueStrings(previous?.keyConcepts)).slice(0, LIMITS.concepts),
    keyFacts: (facts.length ? facts : uniqueStrings(previous?.keyFacts)).slice(0, LIMITS.facts),
    relatedTopics: uniqueStrings([...(previous?.relatedTopics || []), ...relatedTopics]).slice(0, LIMITS.relatedTopics),
    reliabilitySummary: {
      score: numeric(reliability.score, confidence),
      level: text(reliability.level) || "low",
      sourceCount: numeric(reliability.sourceCount, Array.isArray(result.articles) ? result.articles.length : 0),
      independentDomainCount: numeric(reliability.independentDomainCount),
      highQualitySourceCount: numeric(reliability.highQualitySourceCount)
    },
    confidence,
    sourceCount: numeric(reliability.sourceCount, Array.isArray(result.articles) ? result.articles.length : 0),
    audienceLevel: text(result.structuredContent?.audienceLevel || result.audienceLevel || result.analysis?.audienceLevel) || "general",
    timesSearched: numeric(previous?.timesSearched, 0) + 1,
    lastSearched: timestamp,
    title: text(result.title || topic),
    summary: text(result.brain?.summary || result.text),
    facts: Array.isArray(result.brain?.facts) && result.brain.facts.length ? result.brain.facts : previous?.facts || facts,
    keywords: uniqueStrings(result.analysis?.keywords || previous?.keywords),
    related: safeRelated(Array.isArray(result.related) && result.related.length ? result.related : previous?.related),
    sources: Array.isArray(result.sources) && result.sources.length ? result.sources : previous?.sources || [],
    image: text(result.image || previous?.image),
    images: Array.isArray(result.images) && result.images.length ? result.images : previous?.images || [],
    url: text(result.url || previous?.url),
    quiz: result.brain?.quiz || previous?.quiz || null,
    learned: Boolean(previous?.learned),
    learnedAt: previous?.learnedAt || null,
    quizScore: previous?.quizScore || null
  };
}

function tokenSet(record) {
  const stopWords = new Set(["bilgi", "konu", "sistem", "türkiye", "turkiye", "the", "and", "with"]);
  return new Set(normalize([
    record.topic,
    ...(record.keyConcepts || []),
    ...(record.keywords || [])
  ].join(" ")).split(" ").filter(token => token.length > 2 && !stopWords.has(token)));
}

function buildConnections(items) {
  const records = sanitizeRecords(items);
  const byTopic = new Map(records.map(record => [normalize(record.topic), record]));
  const connections = new Map();
  const add = (from, to, relation, score) => {
    const a = normalize(from.topic); const b = normalize(to.topic);
    if (!a || !b || a === b) return;
    const ordered = [a, b].sort();
    const key = `${ordered[0]}::${ordered[1]}`;
    if (!connections.has(key)) connections.set(key, {
      id: stableId(`${ordered[0]}|${ordered[1]}`),
      from: ordered[0] === a ? from.topic : to.topic,
      to: ordered[0] === a ? to.topic : from.topic,
      relation,
      score
    });
    if (connections.size >= LIMITS.connections) return;
  };
  for (const record of records) {
    for (const related of record.relatedTopics || []) {
      const target = byTopic.get(normalize(related));
      if (target) add(record, target, "related", 1);
    }
  }
  for (const group of TOPIC_GROUPS) {
    const members = group.map(topic => byTopic.get(normalize(topic))).filter(Boolean);
    for (let i = 0; i < members.length; i += 1) for (let j = i + 1; j < members.length; j += 1) {
      add(members[i], members[j], "topic-family", 0.8);
      add(members[j], members[i], "topic-family", 0.8);
    }
  }
  const index = new Map();
  for (const record of records) for (const token of tokenSet(record)) {
    if (!index.has(token)) index.set(token, []);
    index.get(token).push(record);
  }
  for (const owners of index.values()) {
    if (owners.length < 2 || owners.length > 40) continue;
    for (let i = 0; i < owners.length; i += 1) for (let j = i + 1; j < owners.length; j += 1) {
      add(owners[i], owners[j], "shared-concept", 0.5);
      add(owners[j], owners[i], "shared-concept", 0.5);
    }
  }
  return [...connections.values()].slice(0, LIMITS.connections);
}

function buildHistory(items) {
  return sanitizeRecords(items)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || normalize(a.topic).localeCompare(normalize(b.topic)) || a.id.localeCompare(b.id))
    .slice(-LIMITS.history)
    .map((item, index, list) => ({
      sequence: index + 1,
      id: item.id,
      topic: item.topic,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      previousTopic: list[index - 1]?.topic || null,
      nextTopic: list[index + 1]?.topic || null
    }));
}

function buildReview(items, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  return sanitizeRecords(items).flatMap(item => REVIEW_INTERVALS.map(days => {
    const due = new Date(new Date(item.updatedAt).getTime() + days * 86400000);
    return {
      id: `${item.id}-review-${days}`,
      memoryId: item.id,
      topic: item.topic,
      intervalDays: days,
      scheduledAt: due.toISOString(),
      due: due <= current
    };
  })).slice(0, LIMITS.records * REVIEW_INTERVALS.length);
}

function buildStats(items, connections = buildConnections(items), now = new Date()) {
  const records = sanitizeRecords(items);
  const studied = [...records].sort((a, b) => numeric(b.timesSearched) - numeric(a.timesSearched) || normalize(a.topic).localeCompare(normalize(b.topic)));
  const confidenceValues = records.map(item => numeric(item.confidence)).filter(value => value > 0);
  return {
    totalTopics: records.length,
    mostStudiedTopic: studied[0]?.topic || null,
    recentTopics: [...records].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt) || normalize(a.topic).localeCompare(normalize(b.topic))).slice(0, LIMITS.recentTopics).map(item => item.topic),
    averageConfidence: confidenceValues.length ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) : 0,
    totalSources: records.reduce((sum, item) => sum + numeric(item.sourceCount), 0),
    connectionCount: connections.length,
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString()
  };
}

function buildSuggestions(entry, items, now = new Date()) {
  if (!entry) return [];
  const records = sanitizeRecords(items);
  const related = (entry.relatedTopics || [])
    .map(topic => records.find(item => normalize(item.topic) === normalize(topic)))
    .filter(Boolean)
    .slice(0, 3)
    .map(item => item.topic);
  const nextReview = buildReview([entry], now).find(item => !item.due);
  const suggestions = [];
  if (entry.timesSearched > 1) suggestions.push({ type: "remembered", text: "Daha önce bu konuyu öğrenmiştin." });
  if (related.length) suggestions.push({ type: "related", text: "Bununla ilişkili şu konuları da araştırabilirsin.", topics: related });
  if (nextReview) suggestions.push({ type: "review", text: "Şu konuyu tekrar etmen faydalı olabilir.", topic: entry.topic, scheduledAt: nextReview.scheduledAt });
  return suggestions;
}

module.exports = {
  REVIEW_INTERVALS,
  LIMITS,
  recoverAtomicFile,
  writeJSONAtomic,
  normalize,
  stableId,
  sanitizeRecord,
  sanitizeRecords,
  buildEntry,
  buildConnections,
  buildHistory,
  buildReview,
  buildStats,
  buildSuggestions
};
