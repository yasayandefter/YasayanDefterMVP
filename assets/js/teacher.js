// ==========================================
// YAŞAYAN DEFTER
// Yaşayan Defter 15.0 Pilot
// Smart Teacher Module
// ==========================================

function teach(topic, content) {

    return {
        topic,

        summary: createSummary(content),

        simple: createSimpleExplanation(content),

        detailed: createDetailedExplanation(content),

        analogy: createAnalogy(topic),

        examples: createExamples(topic),

        quiz: createQuiz(topic),

        nextTopics: suggestNextTopics(topic)
    };
}

// ----------------------------

function createSummary(text) {

    if (!text) return "";

    return text.length > 300
        ? text.substring(0, 300) + "..."
        : text;
}

// ----------------------------

function createSimpleExplanation(text) {

    return "Bu konu daha basit bir dille şöyle açıklanabilir:\n\n" + text;
}

// ----------------------------

function createDetailedExplanation(text) {

    return "Detaylı Anlatım:\n\n" + text;
}

// ----------------------------

function createAnalogy(topic) {

    return `"${topic}" konusunu günlük hayattan bir örnekle düşünmeye çalış. Böylece konu daha akılda kalıcı olur.`;
}

// ----------------------------

function createExamples(topic) {

    return [
        `${topic} ile ilgili gerçek hayattan örnekler araştır.`,
        `${topic} konusunun kullanım alanlarını incele.`
    ];
}

// ----------------------------

function createQuiz(topic) {

    return [
        `${topic} nedir?`,
        `${topic} neden önemlidir?`,
        `${topic} hangi alanlarda kullanılır?`
    ];
}

// ----------------------------

function suggestNextTopics(topic) {

    return [
        `${topic} tarihi`,
        `${topic} uygulamaları`,
        `${topic} örnekleri`
    ];
}

// ----------------------------

module.exports = {
    teach
};
