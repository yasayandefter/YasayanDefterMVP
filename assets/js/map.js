// ==========================================
// YAŞAYAN DEFTER
// KNOWLEDGE MAP ENGINE
// ==========================================

function unique(list = []) {
    return [...new Set(list.filter(Boolean))];
}

function buildMap(topic, links = []) {

    const nodes = unique(
        links
            .map(x => typeof x === "string" ? x : x.title)
            .slice(0, 8)
    );

    return {
        center: topic,
        nodes
    };
}

module.exports = {
    buildMap
};