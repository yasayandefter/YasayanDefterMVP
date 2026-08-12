"use strict";
const assert = require("node:assert/strict");
const claims = require("../brain/currentClaims");

const source = (domain, url, summary, authority = 100) => ({ domain, url, sourceName: domain, summary, authority });
const event = { id: "event-kev", headline: "CISA Adds Known Exploited Vulnerabilities", summary: "CISA added three vulnerabilities to the Known Exploited Vulnerabilities catalog.", sourceRefs: ["https://cisa.gov/a", "https://nist.gov/a"], sources: [source("cisa.gov", "https://cisa.gov/a", "CISA added 3 vulnerabilities.", 100), source("nist.gov", "https://nist.gov/a", "Three vulnerabilities were added by CISA.", 100)] };
const result = claims.buildClaims([event]);
assert.equal(result.claims.length, 1); assert.equal(result.claims[0].numericValue, 3); assert.equal(result.claims[0].claimType, "SECURITY_ALERT"); assert.equal(result.claims[0].sourceCount, 2); assert.equal(result.claims[0].independentDomains, 2); assert.equal(result.claims[0].confidence, "Yüksek"); assert.equal(result.claims[0].eventId, "event-kev"); assert.ok(result.claims[0].entities.includes("CISA"));

const conflict = claims.buildClaims([
  { ...event, id: "event-a", sourceRefs: ["https://a.gov/x"], sources: [source("a.gov", "https://a.gov/x", "CISA added 3 vulnerabilities.")], summary: "CISA added 3 vulnerabilities to the KEV catalog." },
  { ...event, id: "event-b", sourceRefs: ["https://b.gov/x"], sources: [source("b.gov", "https://b.gov/x", "CISA added 5 vulnerabilities.")], summary: "CISA added 5 vulnerabilities to the KEV catalog." }
]);
assert.equal(conflict.contradictions.length, 1); assert.deepEqual(conflict.contradictions[0].variants.map(value => value.numericValue).sort(), [3, 5]); assert.ok(conflict.claims.every(claim => claim.contradicted));

const differentMission = claims.buildClaims([
  { id: "moon", headline: "NASA completes Moon payload", summary: "NASA completed a Moon payload test.", sourceRefs: ["https://nasa.gov/moon"], sources: [source("nasa.gov", "https://nasa.gov/moon", "Moon payload")] },
  { id: "mars", headline: "NASA starts Mars mission", summary: "NASA started a separate Mars mission.", sourceRefs: ["https://esa.int/mars"], sources: [source("esa.int", "https://esa.int/mars", "Mars mission")] }
]);
assert.equal(differentMission.claims.length, 2);
console.log("PASS  atomic claims, types, number words, entities, cross-domain support, traceability, contradiction detection, and false-merge protection");
