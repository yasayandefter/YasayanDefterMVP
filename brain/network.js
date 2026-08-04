/*
=========================================================
 YAŞAYAN DEFTER
 Brain Engine 11.0
 Network Module
=========================================================
*/

const CONFIG =
    typeof require !== "undefined"
        ? require("./config")
        : window.CONFIG;

/* =========================================================
   FETCH JSON
========================================================= */

async function fetchJSON(url, options = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {

        controller.abort();

    }, CONFIG.REQUEST_TIMEOUT);

    try {

        const response = await fetch(url, {

            signal: controller.signal,

            headers: {

                "User-Agent": CONFIG.USER_AGENT,

                "Accept": "application/json",

                ...(options.headers || {})

            },

            ...options

        });

        if (!response.ok) {

            throw new Error(

                `HTTP ${response.status} (${response.statusText})`

            );

        }

        return await response.json();

    }

    catch (err) {

        if (err.name === "AbortError") {

            throw new Error("İstek zaman aşımına uğradı.");

        }

        throw err;

    }

    finally {

        clearTimeout(timeout);

    }

}

/* =========================================================
   FETCH TEXT
========================================================= */

async function fetchText(url, options = {}) {

    const response = await fetch(url, options);

    if (!response.ok) {

        throw new Error(

            `HTTP ${response.status}`

        );

    }

    return await response.text();

}

/* =========================================================
   IMAGE EXISTS
========================================================= */

async function imageExists(url) {

    try {

        const response = await fetch(url, {

            method: "HEAD"

        });

        return response.ok;

    }

    catch {

        return false;

    }

}

/* =========================================================
   DELAY
========================================================= */

function delay(ms) {

    return new Promise(resolve =>

        setTimeout(resolve, ms)

    );

}

/* =========================================================
   RETRY
========================================================= */

async function retry(task, retries = 3) {

    let lastError;

    for (let i = 0; i < retries; i++) {

        try {

            return await task();

        }

        catch (err) {

            lastError = err;

            if (i < retries - 1) {

                await delay(500);

            }

        }

    }

    throw lastError;

}

/* =========================================================
   SEARCH WEB
========================================================= */

async function searchWeb(query){

    query = String(query || "").trim();

    if(!query){

        return {

            articles:[]

        };

    }

    try{

        const url =
            "https://en.wikipedia.org/w/api.php" +
            "?action=query" +
            "&generator=search" +
            "&gsrsearch=" +
            encodeURIComponent(query) +
            "&gsrnamespace=0" +
            "&gsrlimit=5" +
            "&prop=extracts|pageimages|info" +
            "&exintro=1" +
            "&explaintext=1" +
            "&exchars=1200" +
            "&pithumbsize=1000" +
            "&inprop=url" +
            "&format=json" +
            "&origin=*";

        const data = await fetchJSON(url);

        const pages =
            Object.values(
                data.query?.pages || {}
            );

        return{

            articles: pages.map(page => ({

                title: page.title || "",

                text: page.extract || "",

                summary: page.extract || "",

                image: page.thumbnail?.source || "",

                url: page.fullurl || "",

                source: "Wikipedia (EN)",

                language: "en"

            })).filter(article => article.title && article.text)

        };

    }

    catch(error){

        console.warn(
            "searchWeb:",
            error.message
        );

        return{

            articles:[]

        };

    }

}

/* =========================================================
   EXPORT
========================================================= */

const Network={

    fetchJSON,
    fetchText,
    imageExists,
    delay,
    retry,
    searchWeb

};

if (typeof module !== "undefined") {

    module.exports = Network;

}

if (typeof window !== "undefined") {

    window.Network = Network;

}
