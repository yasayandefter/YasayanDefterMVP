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

            if (!info)
                return null;

            const title = cleanText(

                String(page.title || "Görsel")
                    .replace(/^File:/i, "")

            );

            const lower = title.toLowerCase();

            if (blocked.some(word => lower.includes(word)))
                return null;

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

        .slice(0, CONFIG.IMAGE_LIMIT);

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

    const normalized =
        normalizeTopic(topic);

    let query =

        IMAGE_KEYWORDS[normalized]

        ||

        topic;

    switch (
        detectTopicType(topic)
    ) {

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

    return await wikimediaImages(
        query,
        CONFIG.IMAGE_LIMIT
    );

}

/* =========================================================
   EXPORT
========================================================= */

const Images = {

    normalizeTopic,

    detectTopicType,

    wikimediaImages,

    searchImagesForQuestion

};

if (typeof module !== "undefined") {

    module.exports = Images;

}

if (typeof window !== "undefined") {

    window.Images = Images;

}