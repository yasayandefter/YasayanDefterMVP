"use strict";
const assert = require("node:assert/strict");
const quality = require("../brain/currentContentQuality");
const claimsEngine = require("../brain/currentClaims");

const now = "2026-08-12T10:00:00.000Z";
const makeEvent = (id, headline, summary, url) => {
  const item = quality.qualityItem({ providerId: "cisa-advisories", sourceName: "CISA", source: "CISA", domain: "cisa.gov", title: headline, summary, text: summary, url, publishedAt: now, authority: 100, trust: "official" });
  return { id, headline: item.title, summary: item.summary, sourceName: "CISA", sourceRefs: [url], sourceCount: 1, crossSourceSupport: 1, subcategory: item.subcategory, sources: [{ providerId: item.providerId, sourceName: item.sourceName, domain: item.domain, url, title: item.title, summary: item.summary, authority: item.authority }] };
};
const events = [
  makeEvent("johnson", "Johnson Controls C-CURE 9000 Security Advisory", "Summary Successful exploitation could allow an attacker to gain unauthorized access to the system.", "https://cisa.gov/johnson"),
  makeEvent("pulsetto", "Pulsetto Vagus Nerve Stimulator Advisory", "Description Successful exploitation could expose sensitive device information.", "https://cisa.gov/pulsetto"),
  makeEvent("kev", "CISA Adds Known Exploited Vulnerabilities to Catalog", "Overview CISA has added three new vulnerabilities to its Known Exploited Vulnerabilities (KEV) Catalog.", "https://cisa.gov/kev"),
  makeEvent("mira", "Mira Hormone Monitor Security Advisory", "Details Successful exploitation could affect the confidentiality and integrity of health data.", "https://cisa.gov/mira")
];
for (const event of events) assert.doesNotMatch(event.summary, /^(?:Summary|Description|Overview|Details)\s/i);
assert.equal(quality.cleanCurrentText("Executive Summary of the annual report."), "Executive Summary of the annual report.");
assert.equal(quality.cleanCurrentText("The report summarizes current risks."), "The report summarizes current risks.");

const claimResult = claimsEngine.buildClaims(events); const numeric = claimResult.claims.find(claim => claim.eventId === "kev");
assert.ok(numeric); assert.equal(numeric.numericValue, 3); assert.equal(numeric.claimType, "SECURITY_ALERT");
const learning = quality.buildCurrentLearning(events, "Bugünkü siber güvenlik gelişmeleri", claimResult.claims); const quiz = learning.quiz;
assert.ok(quiz); assert.equal(quiz.type, "NUMERIC"); assert.deepEqual(quiz.options, ["2", "3", "4", "5"]); assert.equal(quiz.correctAnswer, "3"); assert.equal(quiz.options.filter(option => option === quiz.correctAnswer).length, 1); assert.equal(new Set(quiz.options).size, 4); assert.ok(quiz.claimRef); assert.ok(quiz.sourceRefs.length >= 1); assert.equal(quiz.verified, true);
assert.ok(learning.flashcards.length > 0); assert.equal(learning.flashcards.some(card => card.question === "Kaynak ile ilgili doğrulanmış gelişme neydi?"), false); assert.ok(learning.flashcards.every(card => card.claimRef && card.sourceRefs.length && card.answer));
const serialized = JSON.stringify({ events, claims: claimResult.claims, facts: learning.facts, flashcards: learning.flashcards, lesson: learning.lesson, quiz });
assert.equal(/(?:Summary|Description|Overview) Successful/i.test(serialized), false); assert.equal(/rawContent|rawDescription|feedBody/i.test(serialized), false);
console.log("PASS  current prefix cleanup, no over-cleaning, CISA numeric value=3, canonical 2/3/4/5 quiz, unique answer, traceability, and entity/event-aware flashcards");
