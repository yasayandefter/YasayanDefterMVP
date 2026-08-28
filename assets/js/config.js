/*
=========================================================
 YAŞAYAN DEFTER
 Yaşayan Defter 15.0 Pilot
 Config
=========================================================
*/

const CONFIG = {

    VERSION: "15.6.0",

    ENGINE_NAME: "Brain Engine 15.6",

    USER_AGENT:
        "YasayanDefter/15.6.0 (Educational Research Engine)",

    WIKIPEDIA_LIMIT: 8,

    IMAGE_LIMIT: 6,

    MEMORY_LIMIT: 100,

    SUMMARY_LIMIT: 1400,

    FACT_LIMIT: 8,

    FLASHCARD_LIMIT: 6,

    REQUEST_TIMEOUT: 18000

};

if (typeof module !== "undefined") {
    module.exports = CONFIG;
}

if (typeof window !== "undefined") {
    window.CONFIG = CONFIG;
}
