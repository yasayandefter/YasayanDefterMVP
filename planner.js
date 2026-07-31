/*
=========================================================
 YAŞAYAN DEFTER
 Brain Engine 11.0
 Research Planner
=========================================================
*/

const {
    normalize
} = require("./analyzer");

/* =========================================================
   LANGUAGE
========================================================= */

function detectLanguage(question){

    return "tr";

}

/* =========================================================
   SEARCH QUERIES
========================================================= */

function buildSearchQueries(analysis){

    const topic = analysis.topic || "";

    const type = analysis.type || "genel";

    const queries = [];

    queries.push(topic);

    switch(type){

        case "nasıl":

            queries.push(topic + " nedir");
            queries.push(topic + " nasıl oluşur");
            queries.push(topic + " çalışma prensibi");
            queries.push(topic + " scientific explanation");

            break;

        case "neden":

            queries.push(topic + " neden olur");
            queries.push(topic + " nedenleri");
            queries.push(topic + " scientific research");

            break;

        case "kim":

            queries.push(topic + " biyografi");
            queries.push(topic + " hayatı");
            queries.push(topic + " wikipedia");

            break;

        default:

            queries.push(topic + " nedir");
            queries.push(topic + " wikipedia");

    }

    return [...new Set(

        queries.filter(Boolean)

    )];

}

/* =========================================================
   SOURCES
========================================================= */

function chooseSources(){

    return [

        "wikipedia",

        "wikimedia"

    ];

}

/* =========================================================
   MAIN PLANNER
========================================================= */

function createResearchPlan(question, analysis){

    return {

        question,

        language: detectLanguage(question),

        topic: analysis.topic,

        domain: analysis.domain,

        searches: buildSearchQueries(analysis),

        imageSearch: analysis.topic,

        sources: chooseSources(),

        timestamp: Date.now()

    };

}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    detectLanguage,

    buildSearchQueries,

    chooseSources,

    createResearchPlan

};