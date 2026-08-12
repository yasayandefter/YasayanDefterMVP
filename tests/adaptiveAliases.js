"use strict";
const assert = require("node:assert/strict");
const aliases = require("../brain/adaptiveAliases");
const signatures = require("../brain/claimSignatures");

const unknown = aliases.extractCandidates("National Digital Safety Laboratory (NDSL) published an advisory.", { evidenceRefs: ["https://ndsl.example/a"] }); assert.equal(unknown.length, 1); assert.equal(unknown[0].canonical, "NDSL"); assert.equal(unknown[0].type, "ORGANIZATION"); assert.ok(unknown[0].confidence >= 90); assert.equal(unknown[0].persistent, false);
const reverse = aliases.extractCandidates("NDSL (National Digital Safety Laboratory) published an advisory.", { evidenceRefs: ["https://ndsl.example/b"] }); assert.equal(reverse.length, 1);
const registry = aliases.buildRegistry([{ title: "National Digital Safety Laboratory (NDSL)", summary: "NDSL issued an alert.", url: "https://ndsl.example/a" }]); assert.equal(registry.highConfidence.length, 1); const enriched = signatures.signature("National Digital Safety Laboratory issued an alert.", { aliasRegistry: registry }); assert.ok(enriched.canonicalEntities.includes("NDSL")); assert.ok(enriched.entityAliasesUsed.includes("NDSL")); assert.equal(enriched.aliasConfidence, 95);
assert.equal(aliases.extractCandidates("Apple pie contains sliced fruit.").length, 0); assert.equal(aliases.extractCandidates("AI tools can assist design.").length, 0); assert.equal(aliases.normalizeNamedEntity("Artemis II"), "ARTEMIS-2"); assert.equal(aliases.normalizeNamedEntity("Artemis 2"), "ARTEMIS-2"); assert.equal(aliases.normalizeNamedEntity("GPT-5"), "GPT-5"); assert.equal(aliases.normalizeNamedEntity("GPT 5"), "GPT-5");
const english = signatures.signature("European Space Agency (ESA) announced a mission", { aliasRegistry: aliases.buildRegistry([{ title: "European Space Agency (ESA)", url: "https://esa.int/a" }]) }); const turkish = signatures.signature("ESA yeni görevi duyurdu"); assert.equal(signatures.match(english, turkish).matched, true);
console.log("PASS  request-scoped alias candidates, parenthetical/reverse acronyms, high-confidence gate, false-alias protection, mission/product normalization, and acronym-assisted bilingual matching");
