/*
=========================================================
 YAŞAYAN DEFTER
 Yaşayan Defter 15.0 Pilot
 Wikipedia Module
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

const {
    cleanText
} = Helpers;

/* =========================================================
   HTTP JSON
========================================================= */

async function fetchJSON(url) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {

        controller.abort();

    }, CONFIG.REQUEST_TIMEOUT);

    try {

        const response = await fetch(url, {

            signal: controller.signal,

            headers: {

                "User-Agent": CONFIG.USER_AGENT,

                "Accept": "application/json"

            }

        });

        if (!response.ok) {

            throw new Error(
                "HTTP " + response.status
            );

        }

        return await response.json();

    }

    finally {

        clearTimeout(timeout);

    }

}

/* =========================================================
   WIKIPEDIA SEARCH
========================================================= */

async function wikipediaSearch(query) {

    const url =

        "https://tr.wikipedia.org/w/api.php" +

        "?action=query" +

        "&generator=search" +

        "&gsrsearch=" +

        encodeURIComponent(query) +

        "&gsrnamespace=0" +

        "&gsrlimit=" +

        CONFIG.WIKIPEDIA_LIMIT +

        "&prop=extracts|pageimages|info" +

        "&exintro=1" +

        "&explaintext=1" +

        "&exchars=6000" +

        "&piprop=thumbnail" +

        "&pithumbsize=1000" +

        "&inprop=url" +

        "&format=json" +

        "&origin=*";

    const data = await fetchJSON(url);

    const pages = data.query?.pages || {};

    return Object.values(pages)

        .map(page => {

            const title = cleanText(page.title);

            if (!title) return null;

            return {

                title,

                text: cleanText(page.extract),

                image: page.thumbnail?.source || "",

                url:

                    page.fullurl ||

                    "https://tr.wikipedia.org/wiki/" +

                    encodeURIComponent(

                        title.replace(/ /g, "_")

                    ),

                source: "Wikipedia"

            };

        })

        .filter(Boolean);

}

/* =========================================================
   MULTI SEARCH
========================================================= */

async function searchWikipediaMultiple(analysis) {

    const searches =

        analysis.researchPlan ||

        [analysis.topic];

    const settled = await Promise.allSettled(

        searches.map(

            wikipediaSearch

        )

    );

    const results = [];

    const seen = new Set();

    for (const item of settled) {

        if (item.status !== "fulfilled")
            continue;

        for (const article of item.value) {

            const key =

                article.title

                .toLocaleLowerCase("tr-TR");

            if (seen.has(key))
                continue;

            seen.add(key);

            results.push(article);

        }

    }

    return results;

}

/* =========================================================
   EXPORT
========================================================= */

const Wikipedia = {

    fetchJSON,

    wikipediaSearch,

    searchWikipediaMultiple

};

module.exports = Wikipedia;
