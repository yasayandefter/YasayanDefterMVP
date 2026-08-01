/*
=========================================================
 YAŞAYAN DEFTER
 Brain Engine 11.0
 Config
=========================================================
*/

const CONFIG = {

    VERSION: "11.0",

    ENGINE_NAME: "Brain Engine 11.0",

    USER_AGENT:
        "YasayanDefter/11.0 (Educational Research Engine)",

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