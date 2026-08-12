"use strict";
const assert = require("node:assert/strict");
const quality = require("../brain/currentContentQuality");

const event = { id: "event-1", headline: "CISA KEV update", summary: "CISA added 3 vulnerabilities to the KEV catalog.", sourceRefs: ["https://cisa.gov/a"], sources: [{ sourceName: "CISA", domain: "cisa.gov", url: "https://cisa.gov/a" }] };
const numeric = { id: "claim-1", eventId: "event-1", text: event.summary, entities: ["CISA"], numericValue: 3, confidence: "Orta", sourceCount: 1, sourceRefs: event.sourceRefs };
const quiz = quality.buildCurrentQuiz([event], [numeric]); assert.equal(quiz.type, "NUMERIC"); assert.equal(quiz.correct, "3"); assert.equal(quiz.claimRef, "claim-1"); assert.deepEqual(quiz.sourceRefs, event.sourceRefs); assert.equal(quiz.verified, true); assert.equal(new Set(quiz.options).size, quiz.options.length); assert.equal(quiz.options.filter(value => value === quiz.correct).length, 1); assert.equal(/hayal ürünü|kaynak bulunamaz|temel açıklamaya göre/i.test(JSON.stringify(quiz)), false);
const low = quality.buildCurrentQuiz([event], [{ ...numeric, confidence: "Sınırlı" }]); assert.equal(low, null);
const conflict = quality.buildCurrentQuiz([event], [{ ...numeric, contradicted: true }]); assert.equal(conflict, null);
const entity = quality.buildCurrentQuiz([event], [{ ...numeric, numericValue: null }]); assert.equal(entity.type, "ENTITY"); assert.equal(entity.claimRef, "claim-1");
const learning = quality.buildCurrentLearning([event], "Bugünkü siber güvenlik gelişmeleri", [numeric]); assert.equal(learning.facts[0].claimRef, "claim-1"); assert.equal(learning.flashcards[0].claimRef, "claim-1"); assert.deepEqual(learning.flashcards[0].sourceRefs, event.sourceRefs);
console.log("PASS  verified numeric/entity quiz, plausible unique distractors, confidence/contradiction gates, and claim-based fact/flashcard traceability");
