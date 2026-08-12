"use strict";
const assert = require("node:assert/strict");
const signatures = require("../brain/claimSignatures");
const providers = require("../brain/currentProviders");
const claims = require("../brain/currentClaims");

const now = "2026-08-12T10:00:00.000Z";
const item = (providerId, domain, title, summary, url) => ({ providerId, sourceName: providerId, domain, title, summary, text: summary, url, publishedAt: now, authority: 100, subcategory: "CYBERSECURITY" });
const english = item("official-en", "cisa.gov", "CISA adds vulnerabilities to KEV", "CISA added three new vulnerabilities to the KEV Catalog.", "https://cisa.gov/a");
const turkish = item("official-tr", "example.gov.tr", "CISA KEV güvenlik duyurusu", "CISA KEV kataloğuna üç yeni güvenlik açığı ekledi.", "https://example.gov.tr/a");
const left = signatures.signature(`${english.title} ${english.summary}`, { publishedAt: now }); const right = signatures.signature(`${turkish.title} ${turkish.summary}`, { publishedAt: now }); const bilingual = signatures.match(left, right);
assert.equal(left.action, "ADD"); assert.equal(right.action, "ADD"); assert.deepEqual(left.numericValues, [3]); assert.deepEqual(right.numericValues, [3]); assert.equal(bilingual.matched, true); assert.ok(bilingual.matchReasons.includes("action")); assert.ok(bilingual.matchReasons.includes("number"));
const clustered = providers.clusterEvents([english, turkish]); assert.equal(clustered.length, 1); assert.equal(clustered[0].sourceRefs.length, 2); assert.equal(clustered[0].independentDomains, 2); assert.equal(clustered[0].crossSourceSupport, true);
const mergedClaims = claims.buildClaims(clustered); assert.equal(mergedClaims.claims.length, 1); assert.equal(mergedClaims.claims[0].sourceRefs.length, 2); assert.equal(mergedClaims.claims[0].independentDomains, 2); assert.equal(mergedClaims.claims[0].crossSourceSupport, true);

const conflictEvents = providers.clusterEvents([english, { ...turkish, summary: "CISA KEV kataloğuna beş yeni güvenlik açığı ekledi.", url: "https://example.gov.tr/b" }]); assert.equal(conflictEvents.length, 2); const conflictClaims = claims.buildClaims(conflictEvents); assert.equal(conflictClaims.contradictions.length, 1); assert.ok(conflictClaims.claims.every(claim => claim.contradicted));
const sameOrg = providers.clusterEvents([item("nasa-a", "science.nasa.gov", "NASA completes lunar payload", "NASA completed a Moon payload mission.", "https://science.nasa.gov/a"), item("nasa-b", "www.nasa.gov", "NASA lunar payload completed", "NASA completed the Moon payload mission.", "https://www.nasa.gov/b")]); assert.equal(sameOrg.length, 1); assert.equal(sameOrg[0].sourceRefs.length, 2); assert.equal(sameOrg[0].independentDomains, 1); assert.equal(sameOrg[0].crossSourceSupport, false);
const separate = providers.clusterEvents([item("nasa-a", "nasa.gov", "NASA completes Moon payload", "NASA completed the Moon payload mission.", "https://nasa.gov/moon"), item("nasa-b", "nasa.gov", "NASA announces Mars mission", "NASA released details of a Mars mission.", "https://nasa.gov/mars")]); assert.equal(separate.length, 2);
const aiA = signatures.signature("A new AI model released", { publishedAt: now }); const aiB = signatures.signature("Yeni yapay zekâ modeli yayınlandı", { publishedAt: now }); assert.equal(signatures.match(aiA, aiB).matched, true);
assert.equal(signatures.normalizeDomain("science.nasa.gov"), "nasa.gov"); assert.equal(signatures.normalizeDomain("www.nasa.gov"), "nasa.gov");
console.log("PASS  claim signatures, bilingual action/topic/number matching, numeric contradiction, same-org normalization, false-merge protection, and AI bilingual fixture");
