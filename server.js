const express = require("express");
const fs = require("fs");
const path = require("path");

const teacher = require("./brain/teacher");
const map = require("./brain/map");

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG = require("./brain/config");
const Analyzer = require("./brain/analyzer");
const Images = require("./brain/images");
const Wikipedia = require("./brain/wikipedia");
const Network = require("./brain/network");

const {

    VERSION,

    ENGINE_NAME

} = CONFIG;

/*
=========================================================
 YAŞAYAN DEFTER — BRAIN ENGINE 10.0
=========================================================

 • OpenAI YOK
 • Ollama YOK
 • Ücretli AI YOK
 • Wikipedia araştırması
 • Wikimedia görselleri
 • Akıllı soru analizi
 • Konu çıkarma
 • Kaynak puanlama
 • Bağlamsal cevap üretimi
 • Yerel hafıza
 • Konuşma hafızası
 • Öğrenme hafızası
 • Quiz
 • Öğrenme istatistikleri
 • Konu ilişkileri
 • Takip sorusu desteği
 • Türkçe soru bağlamı
=========================================================
*/

const UA =
  "YasayanDefter/10.0 (Educational Research Engine)";

/* ========================================================
   EXPRESS
======================================================== */

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

/* ========================================================
   DOSYALAR
======================================================== */

const MEMORY_FILE =
  path.join(__dirname, "memory.json");

const LEARNING_MEMORY_FILE =
  path.join(__dirname, "yasayan_deefter_memory.json");

/* ========================================================
   TEMEL ARAÇLAR
======================================================== */

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return cleanText(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u");
}

function shorten(value, max = 700) {
  const text = cleanText(value);

  if (text.length <= max) {
    return text;
  }

  const part = text.slice(0, max);

  const last = Math.max(
    part.lastIndexOf("."),
    part.lastIndexOf("!"),
    part.lastIndexOf("?")
  );

  if (last > max * 0.55) {
    return part.slice(0, last + 1) + "...";
  }

  return part + "...";
}

function uniqueStrings(items) {
  return [
    ...new Set(
      items
        .map(cleanText)
        .filter(Boolean)
    )
  ];
}

function safeReadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    const raw =
      fs.readFileSync(file, "utf8");

    if (!raw.trim()) {
      return fallback;
    }

    return JSON.parse(raw);
  }

  catch (error) {
    console.warn(
      "JSON okunamadı:",
      file,
      error.message
    );

    return fallback;
  }
}

function safeWriteJSON(file, data) {
  try {
    fs.writeFileSync(
      file,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    return true;
  }

  catch (error) {
    console.error(
      "JSON yazılamadı:",
      file,
      error.message
    );

    return false;
  }
}

/* ========================================================
   HAFIZA DOSYALARI
======================================================== */

function ensureMemoryFiles() {

  if (!fs.existsSync(MEMORY_FILE)) {

    safeWriteJSON(
      MEMORY_FILE,
      {
        user: {},
        memories: [],
        conversations: []
      }
    );
  }

  if (!fs.existsSync(LEARNING_MEMORY_FILE)) {

    safeWriteJSON(
      LEARNING_MEMORY_FILE,
      []
    );
  }
}

ensureMemoryFiles();

/* ========================================================
   ANA HAFIZA
======================================================== */

function readMainMemory() {

  const data =
    safeReadJSON(
      MEMORY_FILE,
      {
        user: {},
        memories: [],
        conversations: []
      }
    );

  if (!data.user) {
    data.user = {};
  }

  if (!Array.isArray(data.memories)) {
    data.memories = [];
  }

  if (!Array.isArray(data.conversations)) {
    data.conversations = [];
  }

  return data;
}

function writeMainMemory(data) {
  return safeWriteJSON(
    MEMORY_FILE,
    data
  );
}

/* ========================================================
   ÖĞRENME HAFIZASI
======================================================== */

function readLearningMemory() {

  const data =
    safeReadJSON(
      LEARNING_MEMORY_FILE,
      []
    );

  if (Array.isArray(data)) {
    return data;
  }

  if (
    data &&
    Array.isArray(data.memories)
  ) {
    return data.memories;
  }

  return [];
}

function writeLearningMemory(items) {
  return safeWriteJSON(
    LEARNING_MEMORY_FILE,
    items
  );
}

/* ========================================================
   TÜRKÇE KÖK / KELİME YARDIMCILARI
======================================================== */

function tokenize(text) {

  return normalize(text)
    .replace(
      /[?!.:,;()[\]{}"'“”‘’/\\\-]+/g,
      " "
    )
    .split(/\s+/)
    .filter(Boolean);
}

function containsAny(text, words) {

  const normalized =
    normalize(text);

  return words.some(
    word =>
      normalized.includes(
        normalize(word)
      )
  );
}

function countMatches(text, words) {

  const normalized =
    normalize(text);

  return words.reduce(
    (count, word) =>
      count +
      (
        normalized.includes(
          normalize(word)
        )
          ? 1
          : 0
      ),
    0
  );
}

/* ========================================================
   SORU ANALİZİ — BRAIN 10
======================================================== */

function analyzeQuestion(input) {

  const original =
    cleanText(input);

  const lower =
    normalize(original);

  let type = "genel";
  let intent = "bilgi";

  /* ------------------------------------------------------
     TAKİP SORULARI
  ------------------------------------------------------ */

  const followUp =
    containsAny(
      lower,
      [
        "bunu",
        "bunun",
        "bundan",
        "burada",
        "orada",
        "devamını",
        "devamini",
        "daha fazla",
        "biraz daha",
        "peki",
        "peki ya",
        "sonra ne olur",
        "bunun nedeni",
        "bunun sebebi"
      ]
    );

  /* ------------------------------------------------------
     SORU TİPİ
  ------------------------------------------------------ */

  if (
    /\b(neden|niçin|niye|sebebi|sebep|neden dolayı)\b/
      .test(lower)
  ) {

    type = "neden";
    intent = "neden-sonuç";
  }

  else if (
    /\b(nasıl|nasil|oluşur|oluştu|oluşmuştur|oluşumu|meydana gelir|meydana geldi|mekanizması|gerçekleşir|gerçekleşti|çalışır|calisir|yapılır|yapilir)\b/
      .test(lower)
  ) {

    type = "nasıl";
    intent = "mekanizma";
  }

  else if (
    /\b(farkı|farki|fark|arasındaki fark|karşılaştır|karsilastir|kıyasla|kiyasla)\b/
      .test(lower)
  ) {

    type = "karşılaştırma";
    intent = "karşılaştırma";
  }

  else if (
    /\b(faydası|faydaları|faydasi|yararı|yararları|yarari|ne işe yarar|ne ise yarar)\b/
      .test(lower)
  ) {

    type = "fayda";
    intent = "fayda";
  }

  else if (
    /\b(zararı|zararları|zarari|risk|tehlikeli|tehlikesi|olumsuz)\b/
      .test(lower)
  ) {

    type = "zarar";
    intent = "risk";
  }

  else if (
    /\b(kim|kimdir|kimdi)\b/
      .test(lower)
  ) {

    type = "kim";
    intent = "kişi";
  }

  else if (
    /\b(nerede|neresi|hangi ülkede|hangi şehirde|hangi sehirde)\b/
      .test(lower)
  ) {

    type = "nerede";
    intent = "konum";
  }

  else if (
    /\b(ne zaman|hangi yıl|hangi yil|kaç yılında|kac yilinda|ne zaman oldu)\b/
      .test(lower)
  ) {

    type = "zaman";
    intent = "zaman";
  }

  else if (
    /\b(kaç|kac|ne kadar|kaç yaşında|kac yasinda|kaç km|kaç tane)\b/
      .test(lower)
  ) {

    type = "miktar";
    intent = "ölçüm";
  }

  else if (
    /\b(ne|nedir|ne demek|anlamı nedir|anlami nedir)\b/
      .test(lower)
  ) {

    type = "nedir";
    intent = "tanım";
  }

  /* ------------------------------------------------------
     STOP WORDS
  ------------------------------------------------------ */

  const stopWords =
    new Set([

      "ben",
      "sen",
      "siz",
      "bana",
      "bize",
      "bir",
      "bu",
      "şu",
      "su",
      "ile",
      "ve",
      "veya",
      "de",
      "da",
      "mi",
      "mı",
      "mu",
      "mü",
      "için",
      "icin",
      "hakkında",
      "hakkinda",
      "konusunda",
      "konusu",
      "olarak",
      "olan",
      "gibi",
      "anlat",
      "açıkla",
      "acikla",
      "söyle",
      "soyle",
      "öğret",
      "ogret",
      "bilgi",
      "ver",
      "neden",
      "niçin",
      "niye",
      "sebebi",
      "sebep",
      "nedeni",
      "nasıl",
      "nasil",
      "oluşur",
      "oluşumu",
      "oluştu",
      "oluşmuştur",
      "oluşan",
      "mekanizması",
      "gerçekleşir",
      "gerçekleşti",
      "meydana",
      "gelir",
      "geldi",
      "çalışır",
      "calisir",
      "kim",
      "kimdir",
      "nerede",
      "neresi",
      "ne",
      "nedir",
      "demek",
      "zaman",
      "hangi",
      "yıl",
      "yılında",
      "yil",
      "yilinda",
      "kaç",
      "kac",
      "kadar",
      "faydası",
      "faydaları",
      "faydasi",
      "yararı",
      "yararları",
      "yarari",
      "zararı",
      "zararları",
      "zarari",
      "risk",
      "tehlike",
      "farkı",
      "farki",
      "fark",
      "arasındaki",
      "arasindaki",
      "karşılaştır",
      "karsilastir",
      "kıyasla",
      "kiyasla"
    ]);

  /* ------------------------------------------------------
     KELİMELER
  ------------------------------------------------------ */

  const words =
    tokenize(original);

  const filteredWords =
    words.filter(
      word =>
        word.length > 2 &&
        !stopWords.has(word)
    );

  let topic =
    filteredWords
      .slice(0, 10)
      .join(" ")
      .trim();

  /* ------------------------------------------------------
     ÖZEL KONU KURALLARI
  ------------------------------------------------------ */

  const topicRules = [

    {
      pattern:
        /\brüya\b|\brüyalar\b|\bdüş görmek\b|\bdüş gör\b/,
      topic:
        "rüya"
    },

    {
      pattern:
        /\buyku\b|\buyumak\b|\buyuyor\b/,
      topic:
        "uyku"
    },

    {
      pattern:
        /\bkara delik\b|\bkara delikler\b/,
      topic:
        "kara delik"
    },

    {
      pattern:
        /\byapay zeka\b|\byapay zekâ\b/,
      topic:
        "yapay zeka"
    },

    {
      pattern:
        /\bmars\b/,
      topic:
        "Mars"
    },

    {
      pattern:
        /\bosmanlı\b|\bosmanli\b/,
      topic:
        "Osmanlı"
    },

    {
      pattern:
        /\bevren\b/,
      topic:
        "evren"
    },

    {
      pattern:
        /\bdeprem\b|\bdepremler\b/,
      topic:
        "deprem"
    },

    {
      pattern:
        /\bgökkuşağı\b|\bgokkusagi\b/,
      topic:
        "gökkuşağı"
    },

    {
      pattern:
        /\binsan\b|\binsanlar\b|\bhomo sapiens\b/,
      topic:
        "insan"
    },

    {
      pattern:
        /\beinstein\b|\balbert einstein\b/,
      topic:
        "Albert Einstein"
    },

    {
      pattern:
        /\bgalaksi\b|\bgalaksiler\b/,
      topic:
        "galaksi"
    },

    {
      pattern:
        /\bkara delik\b.*\bışık\b/,
      topic:
        "kara delik"
    }
  ];

  for (
    const rule
    of topicRules
  ) {

    if (
      rule.pattern.test(lower)
    ) {

      topic =
        rule.topic;

      break;
    }
  }

  /* ------------------------------------------------------
     TAKİP SORUSUNDA HAFIZADAN KONU BUL
  ------------------------------------------------------ */

  let memoryContext = null;

  if (followUp) {

    const memories =
      readLearningMemory();

    const recent =
      memories
        .slice()
        .sort(
          (a, b) =>
            new Date(
              b.lastSearched || 0
            ) -
            new Date(
              a.lastSearched || 0
            )
        );

    if (recent.length) {

      memoryContext =
        recent[0];
    }
  }

  if (
    followUp &&
    memoryContext &&
    (
      !topic ||
      topic.length < 3
    )
  ) {

    topic =
      memoryContext.topic;
  }

  if (!topic) {
    topic = original;
  }

  /* ------------------------------------------------------
     ANAHTAR KELİMELER
  ------------------------------------------------------ */

  const keywords =
    uniqueStrings([
      topic,
      ...filteredWords
    ])
      .slice(0, 15);

  /* ------------------------------------------------------
     ARAŞTIRMA SORGULARI
  ------------------------------------------------------ */

  const researchQueries = [

    original,
    topic

  ];

  if (type === "neden") {

    researchQueries.push(
      topic + " neden olur",
      topic + " nedenleri",
      topic + " bilimsel açıklama",
      topic + " mekanizma",
      topic + " causes"
    );
  }

  if (type === "nasıl") {

    researchQueries.push(
      topic + " nasıl oluşur",
      topic + " nasıl çalışır",
      topic + " oluşum mekanizması",
      topic + " oluşum süreci",
      topic + " nasıl meydana gelir",
      topic + " formation"
    );
  }

  if (type === "kim") {

    researchQueries.push(
      topic + " biyografi",
      topic + " hayatı",
      topic + " biography"
    );
  }

  if (type === "nedir") {

    researchQueries.push(
      topic + " nedir",
      topic + " tanımı",
      topic + " açıklaması"
    );
  }

  if (type === "karşılaştırma") {

    researchQueries.push(
      topic + " farkları",
      topic + " karşılaştırma",
      topic + " differences"
    );
  }

  if (type === "fayda") {

    researchQueries.push(
      topic + " faydaları",
      topic + " yararları"
    );
  }

  if (type === "zarar") {

    researchQueries.push(
      topic + " zararları",
      topic + " riskleri"
    );
  }

  return {

    original,

    type,

    intent,

    subject:
      topic,

    topic,

    keywords,

    followUp,

    memoryContext:

      memoryContext
        ? {
            topic:
              memoryContext.topic,
            summary:
              memoryContext.summary
          }
        : null,

    researchQueries:
      uniqueStrings(
        researchQueries
      ).slice(0, 12)
  };
}

/* ========================================================
   KATEGORİ MOTORU
======================================================== */

function detectCategory(
  title,
  text
) {

  const combined =
    normalize(
      title +
      " " +
      text
    );

  const groups = [

    {
      name:
        "Uzay ve Astronomi",

      words: [
        "uzay",
        "gezegen",
        "yıldız",
        "galaksi",
        "evren",
        "astronomi",
        "kara delik",
        "mars",
        "ay",
        "güneş",
        "kozmoloji",
        "yörünge",
        "uzayzaman",
        "astronaut"
      ]
    },

    {
      name:
        "Bilim",

      words: [
        "bilim",
        "fizik",
        "kimya",
        "biyoloji",
        "atom",
        "molekül",
        "enerji",
        "hücre",
        "evrim",
        "genetik",
        "deney",
        "laboratuvar",
        "araştırma"
      ]
    },

    {
      name:
        "İnsan ve Sağlık",

      words: [
        "insan",
        "vücut",
        "sağlık",
        "hastalık",
        "tıp",
        "doktor",
        "psikoloji",
        "beyin",
        "sinir",
        "uyku",
        "rüya",
        "hafıza",
        "duygu"
      ]
    },

    {
      name:
        "Tarih",

      words: [
        "tarih",
        "imparatorluk",
        "savaş",
        "krallık",
        "devlet",
        "padişah",
        "osmanlı",
        "cumhuriyet",
        "antik",
        "sultan",
        "hanedan"
      ]
    },

    {
      name:
        "Coğrafya",

      words: [
        "ülke",
        "şehir",
        "nehir",
        "dağ",
        "okyanus",
        "deniz",
        "kıta",
        "coğrafya",
        "harita",
        "iklim"
      ]
    },

    {
      name:
        "Teknoloji ve Yapay Zeka",

      words: [
        "bilgisayar",
        "yazılım",
        "programlama",
        "internet",
        "teknoloji",
        "yapay zeka",
        "yapay zekâ",
        "robot",
        "algoritma",
        "veri",
        "makine öğrenmesi"
      ]
    },

    {
      name:
        "Matematik",

      words: [
        "matematik",
        "denklem",
        "geometri",
        "cebir",
        "fonksiyon",
        "türev",
        "integral",
        "olasılık",
        "istatistik",
        "sayı",
        "teorem"
      ]
    },

    {
      name:
        "Sanat ve Kültür",

      words: [
        "sanat",
        "ressam",
        "heykel",
        "müzik",
        "film",
        "yazar",
        "şair",
        "roman",
        "tablo",
        "edebiyat"
      ]
    }
  ];

  let best =
    "Genel Bilgi";

  let bestScore = 0;

  for (
    const group
    of groups
  ) {

    let current = 0;

    for (
      const word
      of group.words
    ) {

      if (
        combined.includes(
          normalize(word)
        )
      ) {

        current++;
      }
    }

    if (
      current > bestScore
    ) {

      bestScore =
        current;

      best =
        group.name;
    }
  }

  return best;
}

/* ========================================================
   INTERNET
======================================================== */

async function fetchJSON(
  url,
  timeoutMs = 18000
) {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {

    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,

          headers: {

            "User-Agent":
              UA,

            "Accept":
              "application/json"
          }
        }
      );

    if (!response.ok) {

      throw new Error(
        "HTTP " +
        response.status
      );
    }

    return await response.json();
  }

  finally {

    clearTimeout(timer);
  }
}

/* ========================================================
   WIKIPEDIA
======================================================== */

async function wikipediaSearch(
  query,
  limit = 8
) {

  const url =
    "https://tr.wikipedia.org/w/api.php" +
    "?action=query" +
    "&generator=search" +
    "&gsrsearch=" +
    encodeURIComponent(query) +
    "&gsrnamespace=0" +
    "&gsrlimit=" +
    limit +
    "&prop=extracts|pageimages|info" +
    "&exintro=1" +
    "&explaintext=1" +
    "&exchars=6000" +
    "&piprop=thumbnail" +
    "&pithumbsize=1000" +
    "&inprop=url" +
    "&format=json" +
    "&origin=*";
  console.log("Wikipedia URL:", url);

  const data =
    await fetchJSON(url);

  console.log(
    "Wikipedia cevabı:",
    JSON.stringify(data, null, 2)
  );

  const pages =
    data.query?.pages || {};

  return Object.values(pages)
    .map(page => {

      const title =
        cleanText(
          page.title
        );

      if (!title) {
        return null;
      }

      return {

        title,

        text:
          cleanText(
            page.extract
          ),

        image:
          page.thumbnail?.source ||
          "",

        url:
          page.fullurl ||
          "https://tr.wikipedia.org/wiki/" +
          encodeURIComponent(
            title.replace(
              / /g,
              "_"
            )
          ),

        source:
          "Wikipedia"
      };
    })
    .filter(Boolean);
}

/* ========================================================
   ÇOKLU WIKIPEDIA
======================================================== */

async function searchWikipediaMultiple(
  analysis
) {

console.log("Araştırma sorguları:", analysis.researchQueries);

  const settled =
    await Promise.allSettled(

      analysis.researchQueries.map(
        query =>
          wikipediaSearch(
            query,
            8
          )
      )
    );

  const all = [];
  const seen = new Set();

  for (
    const result
    of settled
  ) {

    if (
      result.status !==
      "fulfilled"
    ) {
      continue;
    }

    for (
      const article
      of result.value
    ) {

      const key =
        normalize(
          article.title
        );

      if (
        !seen.has(key)
      ) {

        seen.add(key);

        all.push(
          article
        );
      }
    }
  }

  return all;
}

/* ========================================================
   WIKIMEDIA
======================================================== */

function normalizeTopic(text) {
  return (text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const IMAGE_CATEGORIES = {

  animals: [
    "aslan","kaplan","kedi","köpek","fil","zürafa","kurt","ayı",
    "kartal","penguen","yunus","balina","timsah","yılan","maymun",
    "at","inek","koyun","keçi","tavşan"
  ],

  planets: [
    "merkür","venüs","dünya","mars","jüpiter",
    "satürn","uranüs","neptün","plüton","güneş","ay"
  ],

  countries: [
    "türkiye","almanya","fransa","ingiltere",
    "amerika","japonya","çin","rusya","italya"
  ],

  biology: [
    "hücre","dna","rna","mitoz",
    "mayoz","protein","virüs","bakteri"
  ]

};

const IMAGE_KEYWORDS = {

  aslan: "lion",
  kaplan: "tiger",
  fil: "elephant",
  kedi: "cat",
  köpek: "dog",
  kurt: "wolf",
  ayı: "bear",
  zürafa: "giraffe",
  penguen: "penguin",
  yunus: "dolphin",
  balina: "whale",

  mars: "mars",
  dünya: "earth",
  güneş: "sun",
  ay: "moon",

  türkiye: "turkey"

};

function detectTopicType(topic) {

  const t = normalizeTopic(topic);

  if (IMAGE_CATEGORIES.animals.includes(t))
    return "animal";

  if (IMAGE_CATEGORIES.planets.includes(t))
    return "planet";

  if (IMAGE_CATEGORIES.countries.includes(t))
    return "country";

  if (IMAGE_CATEGORIES.biology.includes(t))
    return "biology";

  return "general";

}

async function wikimediaImages(
  query,
  limit = 30
) {

  const url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query" +
    "&generator=search" +
    "&gsrsearch=" +
    encodeURIComponent(query) +
    "&gsrnamespace=6" +
    "&gsrlimit=" +
    limit +
    "&prop=imageinfo" +
    "&iiprop=url|extmetadata" +
    "&iiurlwidth=1200" +
    "&format=json" +
    "&origin=*";

  const data = await fetchJSON(url);

  const pages = data.query?.pages || {};

  const blocked = [
    "pdf",
    "page",
    "crop",
    "thumbnail",
    "icon",
    "logo",
    "svg",
    "airport",
    "havalimanı",
    "dam",
    "baraj",
    "school",
    "lisesi",
    "university",
    "üniversitesi"
  ];

  return Object.values(pages)

    .map(page => {

      const info = page.imageinfo?.[0];

      if (!info) return null;

      const title = cleanText(
        String(page.title || "Görsel")
          .replace(/^File:/i, "")
      );

      const lower = title.toLowerCase();

      if (blocked.some(word => lower.includes(word))) {
        return null;
      }

      return {

        title,

        image:
          info.thumburl ||
          info.url ||
          "",

        original:
          info.url ||
          "",

        source:
          "Wikimedia Commons",

        url:
          "https://commons.wikimedia.org/wiki/" +
          encodeURIComponent(page.title || "")

      };

    })

    .filter(item => item && item.image)

    .sort((a, b) => {

      const score = img => {

        let s = 0;

        const t = img.title.toLowerCase();
        const q = query.toLowerCase().split(" ")[0];

        if (t.includes(q)) s += 100;
        if (t.includes("portrait")) s += 30;
        if (t.includes("photo")) s += 20;
        if (t.includes("photograph")) s += 20;

        return s;

      };

      return score(b) - score(a);

    })

    .slice(0, 6);

}

/* ========================================================
   GÖRSEL ARAŞTIRMASI
======================================================== */
async function searchImagesForQuestion(analysis) {

    const topic = (analysis.topic || "").trim();

    if (!topic) return [];

    const normalized = normalizeTopic(topic);

    let query = IMAGE_KEYWORDS[normalized] || topic;

    const type = detectTopicType(topic);

    switch (type) {

        case "animal":
            query += " animal";
            break;

        case "planet":
            query += " planet";
            break;

        case "country":
            query += " country";
            break;

        case "biology":
            query += " biology";
            break;

    }

    return await wikimediaImages(query, 6);

}
/* ========================================================
   CÜMLELER
======================================================== */

function sentences(text) {

  return cleanText(text)
    .split(
      /(?<=[.!?])\s+/
    )
    .filter(
      sentence =>
        sentence.length >= 25
    );
}

/* ========================================================
   CÜMLE PUANI
======================================================== */

function sentenceScore(
  sentence,
  analysis
) {

  const text =
    normalize(sentence);

  let score = 0;

  const topicWords =
    normalize(
      analysis.topic
    )
      .split(/\s+/)
      .filter(
        word =>
          word.length > 2
      );

  for (
    const word
    of topicWords
  ) {

    if (
      text.includes(word)
    ) {

      score += 5;
    }
  }

  if (
    analysis.type === "nasıl"
  ) {

    score +=
      countMatches(
        text,
        [
          "oluşur",
          "oluşan",
          "oluşumu",
          "oluştu",
          "meydana gelir",
          "meydana geldi",
          "süreç",
          "mekanizma",
          "çöküş",
          "çökmesi",
          "yoğun",
          "kütle",
          "sonucunda",
          "gerçekleşir",
          "gerçekleşti",
          "gelişir",
          "çalışır",
          "çalışma"
        ]
      ) * 8;
  }

  if (
    analysis.type === "neden"
  ) {

    score +=
      countMatches(
        text,
        [
          "neden",
          "nedeni",
          "sebep",
          "sebebi",
          "çünkü",
          "sonucunda",
          "etken",
          "mekanizma",
          "oluşur"
        ]
      ) * 8;
  }

  if (
    analysis.type === "nedir"
  ) {

    score +=
      countMatches(
        text,
        [
          "denir",
          "tanımlanır",
          "olarak tanımlanır",
          "anlamına gelir",
          "nedir"
        ]
      ) * 5;
  }

  if (
    analysis.type === "karşılaştırma"
  ) {

    score +=
      countMatches(
        text,
        [
          "fark",
          "karşı",
          "benzer",
          "ayrılır",
          "diğer",
          "arasındaki"
        ]
      ) * 7;
  }

  if (
    analysis.type === "fayda"
  ) {

    score +=
      countMatches(
        text,
        [
          "fayda",
          "yarar",
          "kullanılır",
          "sağlar",
          "önemli"
        ]
      ) * 7;
  }

  if (
    analysis.type === "zarar"
  ) {

    score +=
      countMatches(
        text,
        [
          "zarar",
          "risk",
          "tehlike",
          "olumsuz",
          "neden olabilir"
        ]
      ) * 7;
  }

  const irrelevant = [

    "film",
    "televizyon filmi",
    "albüm",
    "şarkı",
    "roman",
    "video oyunu",
    "dizi",
    "anlam ayrımı",
    "kurgu",
    "filmograf",
    "oyuncu",
    "yönetmen"

  ];

  score -=
    countMatches(
      text,
      irrelevant
    ) * 20;

  return score;
}

/* ========================================================
   İLGİLİ CÜMLELER
======================================================== */

function selectRelevantSentences(
  text,
  analysis,
  max = 5
) {

  const list =
    sentences(text);

  if (!list.length) {
    return [];
  }

  const scored =
    list.map(
      sentence => ({

        sentence,

        score:
          sentenceScore(
            sentence,
            analysis
          )
      })
    );

  scored.sort(
    (a, b) =>
      b.score -
      a.score
  );

  return scored
    .filter(
      item =>
        item.score > 0
    )
    .slice(0, max)
    .map(
      item =>
        item.sentence
    );
}

/* ========================================================
   MAKALE PUANI
======================================================== */

function articleRelevanceScore(
  article,
  analysis
) {

  const title =
    normalize(
      article.title
    );

  const text =
    normalize(
      article.text
    );

  const topic =
    normalize(
      analysis.topic
    );

  let score = 0;

  if (
    title === topic
  ) {

    score += 120;
  }

  else if (
    title.includes(topic)
  ) {

    score += 70;
  }

  const topicWords =
    topic
      .split(/\s+/)
      .filter(
        word =>
          word.length > 2
      );

  for (
    const word
    of topicWords
  ) {

    if (
      title.includes(word)
    ) {

      score += 15;
    }

    if (
      text.includes(word)
    ) {

      score += 3;
    }
  }

  if (
    analysis.type === "nasıl"
  ) {

    score +=
      countMatches(
        text,
        [
          "oluşur",
          "oluşumu",
          "oluşan",
          "oluştu",
          "çöküş",
          "çökmesi",
          "mekanizma",
          "süreç",
          "meydana",
          "sonucunda",
          "yoğun",
          "kütle"
        ]
      ) * 7;
  }

  if (
    analysis.type === "neden"
  ) {

    score +=
      countMatches(
        text,
        [
          "neden",
          "nedeni",
          "sebep",
          "sebebi",
          "mekanizma",
          "sonucunda",
          "etken"
        ]
      ) * 7;
  }

  if (
    analysis.type === "kim"
  ) {

    score +=
      countMatches(
        text,
        [
          "doğdu",
          "öldü",
          "hayatı",
          "biyografi",
          "yaşamı"
        ]
      ) * 7;
  }

  if (
    title.includes(
      "anlam ayrımı"
    )
  ) {

    score -= 60;
  }

  if (
    title.includes("film")
  ) {

    score -= 50;
  }

  return score;
}

/* ========================================================
   ANA MAKALE
======================================================== */

function chooseMainArticle(
  articles,
  analysis
) {

  if (!articles.length) {
    return null;
  }

  let best =
    articles[0];

  let bestScore =
    -Infinity;

  for (
    const article
    of articles
  ) {

    const score =
      articleRelevanceScore(
        article,
        analysis
      );

    if (
      score >
      bestScore
    ) {

      bestScore =
        score;

      best =
        article;
    }
  }

  return best;
}

/* ========================================================
   RÜYA CEVABI
======================================================== */

function buildDreamAnswer(
  analysis,
  articles
) {

  if (
    analysis.type === "neden"
  ) {

    return (
      "İnsanların neden rüya gördüğünün tek ve kesin açıklaması henüz bilinmiyor. " +
      "Rüyalar özellikle uyku sırasında beynin etkinliğiyle ilişkilidir ve REM uykusunda sık görülür. " +
      "Bilimsel çalışmalar rüyaların hafıza işleme, duygusal düzenleme ve gün içinde yaşanan deneyimlerin işlenmesiyle bağlantılı olabileceğini düşündürüyor."
    );
  }

  const pieces = [];

  for (
    const article
    of articles
  ) {

    const selected =
      selectRelevantSentences(
        article.text,
        analysis,
        5
      );

    pieces.push(
      ...selected
    );
  }

  const unique =
    uniqueStrings(
      pieces
    );

  if (
    unique.length
  ) {

    return shorten(
      unique
        .slice(0, 5)
        .join(" "),
      1400
    );
  }

  return (
    "Rüyalar uyku sırasında ortaya çıkan zihinsel deneyimlerdir ve özellikle REM uykusuyla ilişkilidir."
  );
}

/* ========================================================
   NASIL CEVABI
======================================================== */

function buildHowAnswer(
  analysis,
  articles
) {

  const allSentences = [];

  for (
    const article
    of articles
  ) {

    const selected =
      selectRelevantSentences(
        article.text,
        analysis,
        8
      );

    allSentences.push(
      ...selected
    );
  }

  let unique =
    uniqueStrings(
      allSentences
    );

  /* ------------------------------------------------------
     KARA DELİK ÖZEL SIRALAMA
  ------------------------------------------------------ */

  if (
    normalize(
      analysis.topic
    ).includes(
      "kara delik"
    )
  ) {

    const formation =
      unique.filter(
        sentence => {

          const text =
            normalize(sentence);

          return (
            text.includes("çök") ||
            text.includes("yıldız") ||
            text.includes("kütle") ||
            text.includes("yoğun") ||
            text.includes("oluş") ||
            text.includes("meydana") ||
            text.includes("çekim")
          );
        }
      );

    if (
      formation.length
    ) {

      unique =
        formation.concat(
          unique.filter(
            sentence =>
              !formation.includes(
                sentence
              )
          )
        );
    }
  }

  unique =
    unique.filter(
      sentence => {

        const text =
          normalize(sentence);

        return (
          !text.includes(
            "televizyon filmi"
          ) &&
          !text.includes(
            "yapımı film"
          ) &&
          !text.includes(
            "anlam ayrımı"
          )
        );
      }
    );

  if (
    unique.length
  ) {

    return shorten(
      unique
        .slice(0, 5)
        .join(" "),
      1400
    );
  }

  return (
    analysis.topic +
    " konusunda kaynaklarda oluşum veya çalışma süreciyle ilgili bilgiler bulunmaktadır."
  );
}

/* ========================================================
   NEDEN CEVABI
======================================================== */

function buildReasonAnswer(
  analysis,
  articles
) {

  if (
    analysis.topic === "rüya"
  ) {

    return buildDreamAnswer(
      analysis,
      articles
    );
  }

  const relevant = [];

  for (
    const article
    of articles
  ) {

    const text =
      normalize(
        article.text
      );

    const score =
      countMatches(
        text,
        [
          "neden",
          "nedeni",
          "sebep",
          "mekanizma",
          "oluş",
          "beyin",
          "uyku",
          "hafıza",
          "duygu",
          "işleme",
          "bilim"
        ]
      );

    if (
      score >= 2
    ) {

      relevant.push({
        article,
        score
      });
    }
  }

  relevant.sort(
    (a, b) =>
      b.score -
      a.score
  );

  const pieces = [];

  for (
    const item
    of relevant.slice(0, 5)
  ) {

    for (
      const sentence
      of sentences(
        item.article.text
      )
    ) {

      if (
        containsAny(
          sentence,
          [
            "neden",
            "nedeni",
            "sebep",
            "mekanizma",
            "beyin",
            "uyku",
            "hafıza",
            "duygu",
            "işleme",
            "oluş"
          ]
        )
      ) {

        pieces.push(
          sentence
        );
      }

      if (
        pieces.length >= 6
      ) {

        break;
      }
    }

    if (
      pieces.length >= 6
    ) {

      break;
    }
  }

  if (
    pieces.length
  ) {

    return shorten(
      uniqueStrings(pieces)
        .slice(0, 5)
        .join(" "),
      1400
    );
  }

  return (
    analysis.topic +
    " konusunda mevcut kaynaklarda birden fazla etken ve süreç bulunmaktadır."
  );
}

/* ========================================================
   GENEL ÖZET
======================================================== */

function createSummary(
  text,
  analysis,
  allArticles = []
) {

  if (
    analysis.type === "nasıl"
  ) {

    return buildHowAnswer(
      analysis,
      allArticles.length
        ? allArticles
        : [{ text }]
    );
  }

  if (
    analysis.type === "neden"
  ) {

    return buildReasonAnswer(
      analysis,
      allArticles.length
        ? allArticles
        : [{ text }]
    );
  }

  const selected =
    selectRelevantSentences(
      text,
      analysis,
      6
    );

  if (
    selected.length
  ) {

    return shorten(
      selected
        .slice(0, 5)
        .join(" "),
      1400
    );
  }

  return shorten(
    text,
    1000
  );
}

/* ========================================================
   FACTS
======================================================== */

function extractFacts(
  text,
  analysis = null
) {

  const list =
    sentences(text);

  if (!list.length) {
    return [];
  }

  const patterns = [

    [
      "Tanım",
      /\b(olan|olarak|denir|tanımlanır|bir türüdür)\b/i
    ],

    [
      "Neden",
      /\b(neden|nedeni|sebep|çünkü|sonucu|etken)\b/i
    ],

    [
      "Nasıl",
      /\b(oluşur|oluşan|meydana|süreç|mekanizma|çalışır)\b/i
    ],

    [
      "Tarih",
      /\b(yılında|yüzyılda|MÖ|MS|doğdu|öldü)\b/i
    ],

    [
      "Özellik",
      /\b(özelliği|özellikleri|karakterize)\b/i
    ],

    [
      "Bilimsel Bilgi",
      /\b(bilim|araştırma|çalışma|teori|kuram)\b/i
    ]
  ];

  let candidates =
    list;

  if (
    analysis
  ) {

    const scored =
      list.map(
        sentence => ({

          sentence,

          score:
            sentenceScore(
              sentence,
              analysis
            )
        })
      );

    scored.sort(
      (a, b) =>
        b.score -
        a.score
    );

    candidates =
      scored
        .filter(
          item =>
            item.score > 0
        )
        .map(
          item =>
            item.sentence
        );
  }

  const result = [];

  for (
    const sentence
    of candidates
  ) {

    if (
      result.length >= 8
    ) {
      break;
    }

    let label =
      "Bilgi";

    for (
      const [
        name,
        regex
      ]
      of patterns
    ) {

      if (
        regex.test(
          sentence
        )
      ) {

        label =
          name;

        break;
      }
    }

    if (
      !result.some(
        item =>
          item.text ===
          sentence
      )
    ) {

      result.push({

        title:
          label,

        text:
          shorten(
            sentence,
            360
          )
      });
    }
  }

  return result;
}

/* ========================================================
   İLGİNÇ BİLGİ
======================================================== */

function interestingFact(
  text,
  analysis = null
) {

  if (
    analysis
  ) {

    const selected =
      selectRelevantSentences(
        text,
        analysis,
        3
      );

    if (
      selected.length
    ) {

      return shorten(
        selected[0],
        500
      );
    }
  }

  const list =
    sentences(text);

  return shorten(
    list[1] ||
    list[0] ||
    text,
    500
  );
}

/* ========================================================
   QUIZ
======================================================== */

function createQuiz(
  title,
  text,
  analysis
) {

  const titleNormalized =
    normalize(title);

  const questionNormalized =
    normalize(
      analysis.original
    );

  if (
    titleNormalized.includes(
      "kara delik"
    ) ||
    questionNormalized.includes(
      "kara delik"
    )
  ) {

    return {

      question:
        "Kara deliğin ışığın kaçmasını engelleyecek kadar güçlü çekim alanının sınırına ne ad verilir?",

      correct:
        "Olay ufku",

      options: [

        "Olay ufku",
        "Güneş rüzgârı",
        "Asteroit kuşağı",
        "Manyetosfer"

      ]
    };
  }

  if (
    titleNormalized.includes(
      "rüya"
    ) ||
    questionNormalized.includes(
      "rüya"
    )
  ) {

    if (
      analysis.type === "neden"
    ) {

      return {

        question:
          "İnsanların neden rüya gördüğü hakkında bilimsel olarak hangisi doğrudur?",

        correct:
          "Kesin nedeni tam olarak bilinmemekle birlikte rüyalar uyku, beyin, hafıza ve duygusal işleme süreçleriyle ilişkilendirilmektedir.",

        options: [

          "Kesin nedeni tam olarak bilinmemekle birlikte rüyalar uyku, beyin, hafıza ve duygusal işleme süreçleriyle ilişkilendirilmektedir.",

          "Rüyaların tek nedeni su içmemektir.",

          "Rüyalar yalnızca gündüz görülür.",

          "Bilim insanları nedenini tamamen açıklamıştır."

        ]
      };
    }

    return {

      question:
        "Rüyalar özellikle hangi uyku evresiyle güçlü biçimde ilişkilidir?",

      correct:
        "REM uykusu",

      options: [

        "REM uykusu",
        "Uyanıklık",
        "Sadece derin uyku",
        "Sadece gündüz uykusu"

      ]
    };
  }

  if (
    titleNormalized.includes(
      "einstein"
    ) ||
    questionNormalized.includes(
      "einstein"
    )
  ) {

    return {

      question:
        "Albert Einstein en çok hangi fizik teorisiyle ilişkilendirilir?",

      correct:
        "Görelilik teorisi",

      options: [

        "Görelilik teorisi",
        "Levha tektoniği",
        "Hücre teorisi",
        "Evrim teorisi"

      ]
    };
  }

  if (
    titleNormalized.includes(
      "osmanlı"
    ) ||
    questionNormalized.includes(
      "osmanlı"
    )
  ) {

    return {

      question:
        "Osmanlı Devleti'nin kurucusu kimdir?",

      correct:
        "Osman Gazi",

      options: [

        "Osman Gazi",
        "Fatih Sultan Mehmet",
        "Kanuni Sultan Süleyman",
        "Yavuz Sultan Selim"

      ]
    };
  }

  const first =
    sentences(text)[0] ||
    title +
    " hakkında temel bir bilgidir.";

  const answer =
    shorten(
      first,
      180
    );

  return {

    question:
      title +
      " hakkında aşağıdakilerden hangisi doğrudur?",

    correct:
      answer,

    options: [

      answer,

      title +
      ", yalnızca bir bilgisayar programıdır.",

      title +
      ", Dünya dışında bulunan bir okyanustur.",

      title +
      ", bilimsel veya tarihsel anlam taşımaz."

    ]
  };
}

/* ========================================================
   İLGİLİ KONULAR
======================================================== */

function relatedTopics(
  articles,
  mainTitle,
  analysis = null
) {

  const main =
    normalize(
      mainTitle
    );

  const seen =
    new Set();

  let filtered =
    articles.filter(
      article => {

        const key =
          normalize(
            article.title
          );

        if (
          !key ||
          key === main ||
          seen.has(key)
        ) {

          return false;
        }

        seen.add(key);

        return true;
      }
    );

  if (
    analysis
  ) {

    filtered.sort(
      (a, b) =>
        articleRelevanceScore(
          b,
          analysis
        ) -
        articleRelevanceScore(
          a,
          analysis
        )
    );
  }

  return filtered.slice(
    0,
    10
  );
}

/* ========================================================
   BRAIN
======================================================== */
function calculateConfidence(
    articles,
    images,
    memoryMatch
) {

    let score = 0;

    score += Math.min(articles.length * 8, 60);
    score += Math.min(images.length * 2, 20);

    if (memoryMatch) {
        score += 20;
    }

    return Math.min(score, 100);
}

function createFlashcards(title, text) {

    if (!text) {
        return [];
    }

    const sentences = text
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 40);

    const cards = [];

    cards.push({
        question: title + " nedir?",
        answer: sentences[0] || text.substring(0, 150)
    });

    for (let i = 1; i < Math.min(sentences.length, 6); i++) {

        cards.push({
            question: "Bu konu hakkında önemli bilgi " + i,
            answer: sentences[i]
        });

    }

    return cards;
}

function buildBrain(
  article,
  analysis,
  allArticles = []
) {

  const title =
    article.title ||
    analysis.topic;

  const text =
    article.text ||
    "";

  let summary;

  if (
    analysis.type ===
    "neden"
  ) {

    summary =
      buildReasonAnswer(
        analysis,
        allArticles.length
          ? allArticles
          : [article]
      );
  }

  else {

    summary =
      createSummary(
        text,
        analysis,
        allArticles
      );
  }

  return {

    category:
      detectCategory(
        title,
        text
      ),

    summary,

    facts:
      extractFacts(
        text,
        analysis
      ),

    interesting:
      interestingFact(
        text,
        analysis
      ),

    quiz:
      createQuiz(
        title,
        text,
        analysis
      ),
   flashcards:
      createFlashcards(
        title,
        text
      ),

    questionType:
      analysis.type,

    intent:
      analysis.intent,

    understoodQuestion:
      analysis.original,

    understoodTopic:
      analysis.topic,

    followUp:
      analysis.followUp,

    memoryContext:
      analysis.memoryContext
  };
}

/* ========================================================
   HAFIZADAN KONU BUL
======================================================== */

function findMemoryTopic(
  topic
) {

  const memories =
    readLearningMemory();

  const normalized =
    normalize(topic);

  if (!normalized) {
    return null;
  }

  let exact =
    memories.find(
      item =>
        normalize(
          item.topic
        ) ===
        normalized
    );

  if (exact) {
    return exact;
  }

  exact =
    memories.find(
      item =>
        normalize(
          item.title
        ) ===
        normalized
    );

  if (exact) {
    return exact;
  }

  return (
    memories.find(
      item => {

        const searchable =
          normalize(
            [
              item.topic,
              item.title,
              ...(item.keywords || [])
            ].join(" ")
          );

        return (
          searchable.includes(
            normalized
          ) ||
          normalized.includes(
            normalize(item.topic)
          )
        );
      }
    ) ||
    null
  );
}

/* ========================================================
   ARAŞTIRMA
======================================================== */

async function research(
  query
) {

  const analysis =
    analyzeQuestion(
      query
    );

  const memoryMatch =
    findMemoryTopic(
      analysis.topic
    );

  const articles =
    await searchWikipediaMultiple(
      analysis
    );

let webResult = null;

try {

    webResult = await searchWeb(
        analysis.topic
    );

} catch (error) {

    console.warn(
        "Web araması başarısız:",
        error.message
    );

}

  let images = [];

  try {

    images =
      await searchImagesForQuestion(
        analysis
      );
  }

  catch (error) {

    console.warn(
      "Görseller alınamadı:",
      error.message
    );
  }

  /*
  --------------------------------------------------------
   HEM İNTERNET HEM HAFIZA KULLAN
  --------------------------------------------------------
  */

  if (
    !articles.length &&
    memoryMatch
  ) {

    return {

      ok:
        true,

      version:
        VERSION,

      engine:
        ENGINE_NAME,

      voice:
        true,

      query:
        cleanText(query),

      analysis: {

        type:
          analysis.type,

        intent:
          analysis.intent,

        topic:
          analysis.topic,

        keywords:
          analysis.keywords,

        researchQueries:
          analysis.researchQueries

      },

      title:
        memoryMatch.title ||
        memoryMatch.topic,

      image:
        memoryMatch.image ||
        "",

      text:
        memoryMatch.summary ||
        "",

      url:
        memoryMatch.url ||
        "",

      articles: [],

      images:
        memoryMatch.images ||
        [],

      related:
        memoryMatch.related ||
        [],

      brain: {

        category:
          memoryMatch.category ||
          "Genel Bilgi",

        summary:
          memoryMatch.summary ||
          "Bu konu Yaşayan Defter hafızasında kayıtlı.",

        facts:
          memoryMatch.facts ||
          [],

        interesting:
          memoryMatch.interesting ||
          "",

        quiz:
          memoryMatch.quiz ||
          null,

        questionType:
          analysis.type,

        intent:
          analysis.intent,

        understoodQuestion:
          analysis.original,

        understoodTopic:
          analysis.topic,

        fromMemory:
          true

      },

      sources: [
        "Yaşayan Defter Hafızası"
      ],

      fromMemory:
        true,

      time:
        new Date().toISOString()
    };
  }

  if (
    !articles.length &&
    !images.length
  ) {

    throw new Error(
      "Araştırma sonucu bulunamadı."
    );
  }

  const main =
    chooseMainArticle(
      articles,
      analysis
    ) || {

      title:
        analysis.topic,

      text:
        "",

      image:
        "",

      url:
        ""
    };

  const brain =
    buildBrain(
      main,
      analysis,
      articles
    );

const lesson = teacher.teach(
  analysis.topic,
  brain.summary
);

const related = relatedTopics(
    articles,
    main.title,
    analysis
);

const knowledgeMap = map.buildMap(
    analysis.topic,
    related
);

  return {


    ok:
      true,

    version:
      VERSION,

    engine:
      ENGINE_NAME,

    voice:
      true,

    query:
      cleanText(query),

    analysis: {

      type:
        analysis.type,

      intent:
        analysis.intent,

      topic:
        analysis.topic,

      keywords:
        analysis.keywords,

      researchQueries:
        analysis.researchQueries

    },

    title:
      main.title,

    image:
      main.image ||
      "",

    text:
      main.text ||
      "",

    url:
      main.url ||
      "",

    articles,

    images,

   related: related,


    brain,

ai: {
  summary: brain.summary,
  facts: brain.facts,
  interesting: brain.interesting,
  quiz: brain.quiz,
  lesson: lesson,
  knowledgeMap: knowledgeMap
},

    memoryMatch:
      memoryMatch
        ? {
            topic:
              memoryMatch.topic,
            learned:
              memoryMatch.learned,
            timesSearched:
              memoryMatch.timesSearched
          }
        : null,

    confidence: calculateConfidence(
      articles,
      images,
      memoryMatch
    ),

    sources: [

      "Wikipedia",
      "Wikimedia Commons"

    ],

    fromMemory:
      false,

    time:
      new Date().toISOString()
  };
}

/* ========================================================
   ARAŞTIRMAYI HAFIZAYA KAYDET
======================================================== */

function saveResearchToMemory(
  result
) {

  const items =
    readLearningMemory();

  const topic =
    cleanText(
      result.analysis?.topic ||
      result.title ||
      result.query
    );

  const normalizedTopic =
    normalize(topic);

  const category =
    result.brain?.category ||
    detectCategory(
      result.title,
      result.text
    );

  const existingIndex =
    items.findIndex(
      item =>
        normalize(
          item.topic
        ) ===
        normalizedTopic
    );

  const old =
    existingIndex >= 0
      ? items[existingIndex]
      : null;

  const entry = {

    id:
      old?.id ||
      Date.now().toString(),

    topic,

    category,

    questionType:
      result.brain?.questionType ||
      result.analysis?.type ||
      "genel",

    intent:
      result.brain?.intent ||
      result.analysis?.intent ||
      "bilgi",

    keywords:
      result.analysis?.keywords ||
      [],

    title:
      result.title ||
      topic,

    summary:
      result.brain?.summary ||
      "",

    interesting:
      result.brain?.interesting ||
      "",

    facts:
      result.brain?.facts ||
      [],

    quiz:
      result.brain?.quiz ||
      null,

    image:
      result.image ||
      "",

    images:
      result.images ||
      [],

    related:
      result.related ||
      [],

    url:
      result.url ||
      "",

    lastQuestion:
      result.query ||
      "",

    lastSearched:
      new Date().toISOString(),

    timesSearched:
      old
        ? Number(
            old.timesSearched ||
            0
          ) + 1
        : 1,

    learned:
      old
        ? Boolean(
            old.learned
          )
        : false,

    learnedAt:
      old?.learnedAt ||
      null,

    quizScore:
      old?.quizScore ||
      null
  };

  if (
    existingIndex >= 0
  ) {

    items[
      existingIndex
    ] = {

      ...items[
        existingIndex
      ],

      ...entry
    };

  }

  else {

    items.unshift(
      entry
    );
  }

  writeLearningMemory(
    items
  );

  return entry;
}

/* ========================================================
   ÖĞRENİLDİ
======================================================== */

function markLearned(
  topic
) {

  const items =
    readLearningMemory();

  const normalized =
    normalize(topic);

  const index =
    items.findIndex(
      item =>
        normalize(
          item.topic
        ) ===
        normalized
    );

  if (
    index === -1
  ) {

    return null;
  }

  items[index].learned =
    true;

  items[index].learnedAt =
    new Date().toISOString();

  writeLearningMemory(
    items
  );

  return items[index];
}

/* ========================================================
   QUIZ SONUCU
======================================================== */

function saveQuizResult(
  topic,
  score,
  total
) {

  const items =
    readLearningMemory();

  const normalized =
    normalize(topic);

  const index =
    items.findIndex(
      item =>
        normalize(
          item.topic
        ) ===
        normalized
    );

  if (
    index === -1
  ) {

    return null;
  }

  const numericScore =
    Number(score) || 0;

  const numericTotal =
    Number(total) || 0;

  const percentage =
    numericTotal > 0
      ? Math.round(
          (
            numericScore /
            numericTotal
          ) *
          100
        )
      : 0;

  items[index].quizScore = {

    score:
      numericScore,

    total:
      numericTotal,

    percentage,

    date:
      new Date().toISOString()
  };

  if (
    percentage >= 70
  ) {

    items[index].learned =
      true;

    items[index].learnedAt =
      new Date().toISOString();
  }

  writeLearningMemory(
    items
  );

  return items[index];
}

/* ========================================================
   HAFIZA ARAMA
======================================================== */

function searchMemory(
  query
) {

  const q =
    normalize(query);

  if (!q) {
    return [];
  }

  const items =
    readLearningMemory();

  const queryWords =
    tokenize(q);

  return items
    .map(
      item => {

        const searchable =
          normalize(
            [
              item.topic,
              item.title,
              item.category,
              item.summary,
              item.interesting,
              ...(item.keywords || [])
            ].join(" ")
          );

        let score = 0;

        if (
          searchable.includes(q)
        ) {

          score += 20;
        }

        for (
          const word
          of queryWords
        ) {

          if (
            searchable.includes(word)
          ) {

            score += 3;
          }
        }

        return {
          item,
          score
        };
      }
    )
    .filter(
      result =>
        result.score > 0
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    )
    .slice(0, 20)
    .map(
      result =>
        result.item
    );
}

/* ========================================================
   KONU SİL
======================================================== */

function deleteMemoryTopic(
  topic
) {

  const items =
    readLearningMemory();

  const normalized =
    normalize(topic);

  const filtered =
    items.filter(
      item =>
        normalize(
          item.topic
        ) !==
        normalized
    );

  const changed =
    filtered.length !==
    items.length;

  if (
    changed
  ) {

    writeLearningMemory(
      filtered
    );
  }

  return changed;
}

/* ========================================================
   KONUŞMA KAYDET
======================================================== */

function saveConversation(
  userMessage,
  assistantMessage
) {

  const memory =
    readMainMemory();

  memory.conversations.push({

    id:
      Date.now().toString(),

    user:
      cleanText(
        userMessage
      ),

    assistant:
      cleanText(
        assistantMessage
      ),

    date:
      new Date().toISOString()
  });

  if (
    memory.conversations.length >
    100
  ) {

    memory.conversations =
      memory.conversations.slice(
        -100
      );
  }

  writeMainMemory(
    memory
  );

  return memory.conversations[
    memory.conversations.length - 1
  ];
}

/* ========================================================
   SON KONUŞMA BAĞLAMI
======================================================== */

function getRecentConversationContext(
  limit = 8
) {

  const memory =
    readMainMemory();

  return memory.conversations
    .slice(-limit);
}

/* ========================================================
   API — RESEARCH
======================================================== */

app.get(
  "/api/research",
  async (
    req,
    res
  ) => {

    const query =
      cleanText(
        req.query.q
      );

    if (!query) {

      return res
        .status(400)
        .json({

          ok:
            false,

          error:
            "Arama konusu boş."
        });
    }

    try {

      const result =
        await research(
          query
        );

      res.json(
        result
      );

    }

    catch (error) {

      console.error(
        "ARAŞTIRMA HATASI:",
        error.message
      );

      res
        .status(500)
        .json({

          ok:
            false,

          error:
            "İnternet araştırması tamamlanamadı.",

          detail:
            error.message
        });
    }
  }
);

/* ========================================================
   API — ANALYZE
======================================================== */

app.get("/api/analyze", (req, res) => {

    const query = Analyzer.cleanText(req.query.q);

    if (!query) {

        return res.status(400).json({

            ok: false,

            error: "Analiz konusu boş."

        });

    }

    try {

        const analysis = Analyzer.analyzeQuestion(query);

        res.json({

            ok: true,

            version: VERSION,

            engine: ENGINE_NAME,

            analysis

        });

    }

    catch (error) {

        res.status(500).json({

            ok: false,

            error: "Soru analiz edilemedi.",

            detail: error.message

        });

    }

});

/* ========================================================
   API — IMAGES
======================================================== */

app.get("/api/images", async (req, res) => {

    const query = Analyzer.cleanText(req.query.q);

    if (!query) {

        return res.status(400).json({

            ok: false,

            error: "Görsel konusu gerekli."

        });

    }

    try {

        const analysis = Analyzer.analyzeQuestion(query);

        const images = await Images.searchImagesForQuestion(

            analysis

        );

        res.json({

            ok: true,

            version: VERSION,

            engine: ENGINE_NAME,

            query,

            topic: analysis.topic,

            images,

            count: images.length

        });

    }

    catch (error) {

        res.status(500).json({

            ok: false,

            error: "Görseller alınamadı.",

            detail: error.message

        });

    }

});

/* ========================================================
   API — MEMORY LIST
======================================================== */

app.get(
  "/api/memory/list",
  (
    req,
    res
  ) => {

    const memories =
      readLearningMemory();

    res.json({

      ok:
        true,

      count:
        memories.length,

      memories
    });
  }
);

/* ========================================================
   API — MEMORY SEARCH
======================================================== */

app.get(
  "/api/memory/search",
  (
    req,
    res
  ) => {

    const query =
      cleanText(
        req.query.q
      );

    if (!query) {

      return res
        .status(400)
        .json({

          ok:
            false,

          error:
            "Hafıza arama konusu boş."
        });
    }

    const results =
      searchMemory(
        query
      );

    res.json({

      ok:
        true,

      query,

      count:
        results.length,

      results

    });
  }
);

/* ========================================================
   API — LEARNED
======================================================== */

app.post(
  "/api/memory/learned",
  (
    req,
    res
  ) => {

    const topic =
      cleanText(
        req.body?.topic
      );

    if (!topic) {

      return res
        .status(400)
        .json({

          ok:
            false,

          error:
            "Konu belirtilmedi."
        });
    }

    const memory =
      markLearned(
        topic
      );

    if (!memory) {

      return res
        .status(404)
        .json({

          ok:
            false,

          error:
            "Bu konu hafızada bulunamadı."
        });
    }

    res.json({

      ok:
        true,

      message:
        "Konu öğrenildi olarak işaretlendi.",

      memory

    });
  }
);

/* ========================================================
   API — QUIZ
======================================================== */

app.post(
  "/api/memory/quiz",
  (
    req,
    res
  ) => {

    const topic =
      cleanText(
        req.body?.topic
      );

    const score =
      Number(
        req.body?.score
      );

    const total =
      Number(
        req.body?.total
      );

    if (!topic) {

      return res
        .status(400)
        .json({

          ok:
            false,

          error:
            "Quiz konusu belirtilmedi."
        });
    }

    const memory =
      saveQuizResult(
        topic,
        score,
        total
      );

    if (!memory) {

      return res
        .status(404)
        .json({

          ok:
            false,

          error:
            "Bu konu hafızada bulunamadı."
        });
    }

    res.json({

      ok:
        true,

      message:
        "Quiz sonucu kaydedildi.",

      memory

    });
  }
);

/* ========================================================
   API — MEMORY DELETE
======================================================== */

app.delete(
  "/api/memory/:topic",
  (
    req,
    res
  ) => {

    const topic =
      cleanText(
        req.params.topic
      );

    if (!topic) {

      return res
        .status(400)
        .json({

          ok:
            false,

          error:
            "Silinecek konu belirtilmedi."
        });
    }

    const deleted =
      deleteMemoryTopic(
        topic
      );

    res.json({

      ok:
        true,

      deleted,

      message:
        deleted
          ? "Konu hafızadan silindi."
          : "Konu hafızada bulunamadı."

    });
  }
);

/* ========================================================
   API — CONVERSATION SAVE
======================================================== */

app.post(
  "/api/conversation",
  (
    req,
    res
  ) => {

    const user =
      cleanText(
        req.body?.user
      );

    const assistant =
      cleanText(
        req.body?.assistant
      );

    if (
      !user ||
      !assistant
    ) {

      return res
        .status(400)
        .json({

          ok:
            false,

          error:
            "Konuşma verisi eksik."
        });
    }

    const conversation =
      saveConversation(
        user,
        assistant
      );

    res.json({

      ok:
        true,

      conversation

    });
  }
);

/* ========================================================
   API — CONVERSATION HISTORY
======================================================== */

app.get(
  "/api/conversation",
  (
    req,
    res
  ) => {

    const memory =
      readMainMemory();

    res.json({

      ok:
        true,

      count:
        memory.conversations.length,

      conversations:
        memory.conversations

    });
  }
);

/* ========================================================
   API — RECENT CONTEXT
======================================================== */

app.get(
  "/api/conversation/recent",
  (
    req,
    res
  ) => {

    const limit =
      Math.min(
        Math.max(
          Number(
            req.query.limit
          ) || 8,
          1
        ),
        30
      );

    res.json({

      ok:
        true,

      conversations:
        getRecentConversationContext(
          limit
        )
    });
  }
);

/* ========================================================
   API — LEARNING STATS
======================================================== */

app.get(
  "/api/learning/stats",
  (
    req,
    res
  ) => {

    const memories =
      readLearningMemory();

    const total =
      memories.length;

    const learned =
      memories.filter(
        item =>
          item.learned === true
      ).length;

    const quizCompleted =
      memories.filter(
        item =>
          item.quizScore
      ).length;

    const quizItems =
      memories.filter(
        item =>
          item.quizScore
      );

    const averageQuiz =
      quizItems.length
        ? Math.round(

            quizItems.reduce(
              (
                sum,
                item
              ) =>
                sum +
                Number(
                  item
                    .quizScore
                    ?.percentage ||
                  0
                ),
              0
            ) /
            quizItems.length

          )
        : 0;

    const categories = {};

    for (
      const item
      of memories
    ) {

      const category =
        item.category ||
        "Genel Bilgi";

      categories[category] =
        (
          categories[category] ||
          0
        ) + 1;
    }

    const progress =
      total > 0
        ? Math.round(
            (
              learned /
              total
            ) *
            100
          )
        : 0;

    res.json({

      ok:
        true,

      stats: {

        totalTopics:
          total,

        learnedTopics:
          learned,

        quizCompleted,

        averageQuizScore:
          averageQuiz,

        progress,

        categories

      }
    });
  }
);

/* ========================================================
   API — RECENT LEARNING
======================================================== */

app.get(
  "/api/learning/recent",
  (
    req,
    res
  ) => {

    const memories =
      readLearningMemory();

    const recent =
      memories
        .slice()
        .sort(
          (
            a,
            b
          ) =>
            new Date(
              b.lastSearched ||
              0
            ) -
            new Date(
              a.lastSearched ||
              0
            )
        )
        .slice(
          0,
          10
        );

    res.json({

      ok:
        true,

      memories:
        recent

    });
  }
);

/* ========================================================
   API — RELATED MEMORY
======================================================== */

app.get(
  "/api/memory/related",
  (
    req,
    res
  ) => {

    const topic =
      cleanText(
        req.query.q
      );

    if (!topic) {

      return res
        .status(400)
        .json({

          ok:
            false,

          error:
            "Konu gerekli."
        });
    }

    const analysis =
      analyzeQuestion(
        topic
      );

    const memories =
      readLearningMemory();

    const related =
      memories
        .map(
          item => {

            const searchable =
              normalize(
                [
                  item.topic,
                  item.title,
                  item.category,
                  ...(item.keywords || [])
                ].join(" ")
              );

            const score =
              countMatches(
                searchable,
                [
                  analysis.topic,
                  ...(analysis.keywords || [])
                ]
              );

            return {
              item,
              score
            };
          }
        )
        .filter(
          item =>
            item.score > 0
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        )
        .slice(0, 10)
        .map(
          item =>
            item.item
        );

    res.json({

      ok:
        true,

      topic,

      related

    });
  }
);

/* ========================================================
   API — STATUS
======================================================== */

app.get(
  "/api/status",
  (
    req,
    res
  ) => {

    const learningMemory =
      readLearningMemory();

    const mainMemory =
      readMainMemory();

    res.json({

      ok:
        true,

      name:
        "Yaşayan Defter",

      version:
        VERSION,

      engine:
        ENGINE_NAME,

      internet:
        true,

      wikipedia:
        true,

      wikimedia:
        true,

      questionAnalysis:
        true,

      intelligentTopicExtraction:
        true,

      contextualResearch:
        true,

      sourceRanking:
        true,

      knowledgeSynthesis:
        true,

      duplicateRemoval:
        true,

      smartImageSearch:
        true,

      relevantImageFiltering:
        true,

      contextualQuiz:
        true,

      reasonBasedAnswer:
        true,

      voiceSupport:
        true,

      localMemory:
        true,

      learningMemory:
        true,

      conversationMemory:
        true,

      learningProgress:
        true,

      quizTracking:
        true,

      questionAwareSummary:
        true,

      mechanismAwareResearch:
        true,

      contextualFollowUp:
        true,

      memoryAwareResearch:
        true,

      relatedMemory:
        true,

      openai:
        false,

      ollama:
        false,

      paidAI:
        false,

      memoryTopics:
        learningMemory.length,

      conversations:
        mainMemory
          .conversations
          .length

    });
  }
);

/* ========================================================
   ANA SAYFA
======================================================== */

app.get(
  "/",
  (
    req,
    res
  ) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

/* ========================================================
   API 404
======================================================== */

app.use(
  "/api",
  (
    req,
    res
  ) => {

    res
      .status(404)
      .json({

        ok:
          false,

        error:
          "Yaşayan Defter API yolu bulunamadı."
      });
  }
);

/* ========================================================
   GENEL HATA
======================================================== */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "SUNUCU HATASI:",
      error
    );

    res
      .status(500)
      .json({

        ok:
          false,

        error:
          "Sunucuda beklenmeyen bir hata oluştu.",

        detail:
          error.message
      });
  }
);

/* ========================================================
   SERVER
======================================================== */

if (require.main === module) {

  app.listen(PORT, () => {

    console.log(
      "=========================================="
    );

    console.log(
      "📖 YAŞAYAN DEFTER"
    );

    console.log(
      "🧠 BRAIN ENGINE 10.0"
    );

    console.log(
      "🌐 INTERNET RESEARCH ENGINE"
    );

    console.log(
      "🔎 CONTEXT-AWARE SEARCH"
    );

    console.log(
      "🧠 SMART QUESTION ANALYSIS"
    );

    console.log(
      "📚 LEARNING MEMORY ENGINE"
    );

    console.log(
      "💾 LOCAL CONVERSATION MEMORY"
    );

    console.log(
      "🖼️ SMART WIKIMEDIA IMAGE ENGINE"
    );

    console.log(
      "🎯 CONTEXT-AWARE QUIZ"
    );

    console.log(
      "📈 LEARNING PROGRESS ENGINE"
    );

    console.log(
      "🔊 VOICE SUPPORT"
    );

    console.log(
      "🧩 FOLLOW-UP QUESTION ENGINE"
    );

    console.log(
      "🧠 MEMORY-AWARE RESEARCH"
    );

    console.log(
      "🔗 RELATED MEMORY ENGINE"
    );

    console.log(
      "🚫 NO OPENAI API"
    );

    console.log(
      "🚫 NO OLLAMA"
    );

    console.log(
      "🚫 NO PAID AI"
    );

    console.log(
      "=========================================="
    );

    console.log(
      "🚀 http://localhost:" +
      PORT
    );

    console.log(
      "🧪 Test:"
    );

    console.log(
      "/api/research?q=kara%20delik%20nasıl%20oluşur"
    );

    console.log(
      "🧪 Test 2:"
    );

    console.log(
      "/api/analyze?q=kara%20delik%20neden%20oluşur"
    );

    console.log(
      "📖 Memory:"
    );

    console.log(
      "/api/memory/list"
    );

    console.log(
      "🔎 Memory Search:"
    );

    console.log(
      "/api/memory/search?q=kara%20delik"
    );

    console.log(
      "📈 Stats:"
    );

    console.log(
      "/api/learning/stats"
    );

    console.log(
      "🧠 Brain Engine 10.0 hazır."
    );

  });

}

module.exports = app;