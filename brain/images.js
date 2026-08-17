/*
=========================================================
 YAŞAYAN DEFTER
 Brain Engine 11.0
 Images Module
=========================================================
*/

const CONFIG =
    typeof require !== "undefined"
        ? require("./config")
        : window.CONFIG;

const Helpers =
    typeof require !== "undefined"
        ? require("./helpers")
        : window.Helpers;

const Network =
    typeof require !== "undefined"
        ? require("./network")
        : window.Network;

const VisualIntelligence =
    typeof require !== "undefined"
        ? require("./visualIntelligence")
        : window.VisualIntelligence;

const IMAGE_CACHE = new Map();
const IMAGE_CACHE_MAX = 80;
const IMAGE_CACHE_TTL_MS = 15 * 60 * 1000;
const IMAGE_PROVIDER_TIMEOUT_MS = 4500;
function withImageTimeout(task) {
    let timer;
    return Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("IMAGE_PROVIDER_TIMEOUT")), IMAGE_PROVIDER_TIMEOUT_MS); })]).finally(() => clearTimeout(timer));
}

const {
    cleanText,
    normalize
} = Helpers;

const {
    fetchJSON
} = Network;

/* =========================================================
   TOPIC NORMALIZE
========================================================= */

function normalizeTopic(topic) {

    return normalize(topic)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

}

/* =========================================================
   IMAGE CATEGORIES
========================================================= */

const IMAGE_CATEGORIES = {

    animals: [
        "aslan",
        "kaplan",
        "kedi",
        "köpek",
        "fil",
        "zürafa",
        "ayı",
        "kurt",
        "penguen",
        "yunus",
        "balina"
    ],

    planets: [
        "merkür",
        "venüs",
        "dünya",
        "mars",
        "jüpiter",
        "satürn",
        "uranüs",
        "neptün",
        "güneş",
        "ay"
    ],

    biology: [
        "dna",
        "rna",
        "hücre",
        "protein",
        "virüs",
        "bakteri"
    ],

    countries: [
        "türkiye",
        "almanya",
        "fransa",
        "amerika",
        "japonya"
    ]

};

/* =========================================================
   IMAGE KEYWORDS
========================================================= */

const IMAGE_KEYWORDS = {

    aslan: "lion",

    kaplan: "tiger",

    fil: "elephant",

    mars: "mars",

    dünya: "earth",

    güneş: "sun",

    ay: "moon",

    türkiye: "turkey"

};

/* =========================================================
   DETECT TOPIC TYPE
========================================================= */

function detectTopicType(topic) {

    const t = normalizeTopic(topic);

    if (IMAGE_CATEGORIES.animals.includes(t))
        return "animal";

    if (IMAGE_CATEGORIES.planets.includes(t))
        return "planet";

    if (IMAGE_CATEGORIES.biology.includes(t))
        return "biology";

    if (IMAGE_CATEGORIES.countries.includes(t))
        return "country";

    return "general";

}

/* =========================================================
   WIKIMEDIA SEARCH
========================================================= */

async function wikimediaImages(
    query,
    limit = CONFIG.IMAGE_LIMIT
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
        "&iiprop=url|size|mime|extmetadata" +
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

            if (!info)
                return null;

            const title = cleanText(

                String(page.title || "Görsel")
                    .replace(/^File:/i, "")

            );

            const lower = title.toLowerCase();

            if (blocked.some(word => lower.includes(word)))
                return null;

            const metadata = info.extmetadata || {};
            const meta = key => cleanText(metadata[key]?.value || "");
            const sourceUrl = "https://commons.wikimedia.org/wiki/" + encodeURIComponent(page.title || "");

            return {

                id: String(page.pageid || page.title || info.url),

                title,

                image:

                    info.thumburl ||

                    info.url ||

                    "",

                original:

                    info.url ||

                    "",

                url: info.thumburl || info.url || "",

                thumbnailUrl: info.thumburl || info.url || "",

                description: meta("ImageDescription") || meta("ObjectName"),

                sourceName: "Wikimedia Commons",

                sourceUrl,

                domain: "commons.wikimedia.org",

                mime: info.mime || "",

                width: Number(info.width || info.thumbwidth) || null,

                height: Number(info.height || info.thumbheight) || null,

                license: meta("LicenseShortName") || meta("UsageTerms") || "Belirtilmemiş",

                attribution: meta("Artist") || meta("Credit") || "Wikimedia Commons",

                source: "Wikimedia Commons",

                sourceRefs: [sourceUrl]

            };

        })

        .filter(item => item && item.image)

        .sort((a, b) => {

            const score = img => {

                let s = 0;

                const t = img.title.toLowerCase();

                const q = query
                    .toLowerCase()
                    .split(" ")[0];

                if (t.includes(q))
                    s += 100;

                if (t.includes("portrait"))
                    s += 30;

                if (t.includes("photo"))
                    s += 20;

                if (t.includes("photograph"))
                    s += 20;

                return s;

            };

            return score(b) - score(a);

        })

        .slice(0, Math.max(limit, CONFIG.IMAGE_LIMIT));

}

/* =========================================================
   IMAGE RESEARCH
========================================================= */

async function searchImagesForQuestion(
    analysis
) {

    const topic =
        (analysis.topic || "").trim();

    if (!topic)
        return [];

    const context = VisualIntelligence.createContext(analysis.originalQuestion || topic, analysis);
    if (context.intent === VisualIntelligence.VISUAL_INTENTS.CURRENT_EVENT || !context.queries.length) return [];
    const cacheKey = VisualIntelligence.fold(`${context.intent}|${context.entity}|${context.queries.map(item => item.query).join("|")}`);
    const cached = IMAGE_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.at < IMAGE_CACHE_TTL_MS) return cached.value.map(item => ({ ...item }));
    const settled = await Promise.allSettled(
        context.queries.map(item => withImageTimeout(wikimediaImages(item.query, 8))
            .then(values => values.map(value => ({ ...value, comparisonSide: item.side, queryUsed: item.query }))))
    );
    const candidates = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
    const ranked = VisualIntelligence.rankCandidates(candidates, context);
    IMAGE_CACHE.set(cacheKey, { at: Date.now(), value: ranked });
    while (IMAGE_CACHE.size > IMAGE_CACHE_MAX) IMAGE_CACHE.delete(IMAGE_CACHE.keys().next().value);
    return ranked;

}

/* =========================================================
   EXPORT
========================================================= */

const Images = {

    normalizeTopic,

    detectTopicType,

    wikimediaImages,

    searchImagesForQuestion

    ,clearImageCache: () => IMAGE_CACHE.clear()

};

if (typeof module !== "undefined") {

    module.exports = Images;

}

if (typeof window !== "undefined") {

    window.Images = Images;

}
