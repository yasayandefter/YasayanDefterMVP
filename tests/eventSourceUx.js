"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"); const path = require("node:path");
const intelligence = require("../brain/researchIntelligence"); const freshness = require("../brain/freshness"); const providers = require("../brain/currentProviders");
const query = "Bugünkü siber güvenlik gelişmeleri"; const now = "2026-08-12T10:00:00.000Z";
const items = [
  { providerId: "a", sourceName: "CISA", source: "CISA", domain: "cisa.gov", title: "CISA adds vulnerabilities to KEV", summary: "CISA added three new vulnerabilities to the KEV Catalog.", text: "CISA added three new vulnerabilities to the KEV Catalog.", url: "https://cisa.gov/a", publishedAt: now, authority: 100, trust: "official", currentRelevanceVerified: true, subcategory: "CYBERSECURITY" },
  { providerId: "b", sourceName: "Security Institution", source: "Security Institution", domain: "security.example.org", title: "CISA KEV güvenlik duyurusu", summary: "CISA KEV kataloğuna üç yeni güvenlik açığı ekledi.", text: "CISA KEV kataloğuna üç yeni güvenlik açığı ekledi.", url: "https://security.example.org/b", publishedAt: now, authority: 95, trust: "official", currentRelevanceVerified: true, subcategory: "CYBERSECURITY" }
];
const events = providers.clusterEvents(items); const detection = freshness.detectFreshness(query, new Date(now)); const context = intelligence.buildContext(query, detection); const dto = intelligence.enhanceResult(intelligence.createCurrentResult(query, { items, events, checkedAt: now }, detection, context), context); const section = dto.structuredContent.sections[0];
assert.equal(section.sourceRefs.length, 2); assert.equal(section.sources.length, 2); assert.equal(section.sourceCount, 2); assert.equal(section.crossSourceSupport, true); assert.equal(section.independentDomains, 2); assert.equal(section.claimRefs.length, 1); assert.equal(section.reliability.label, "Yüksek"); assert.ok(section.sources.every(source => /^https:\/\//.test(source.url) && source.provider && source.domain));
const app = fs.readFileSync(path.join(__dirname, "..", "assets/js/app.js"), "utf8"); const css = fs.readFileSync(path.join(__dirname, "..", "assets/css/style.css"), "utf8");
assert.match(app, /Kaynakları Gör/); assert.match(app, /aria-expanded/); assert.match(app, /aria-controls/); assert.match(app, /noopener noreferrer/); assert.match(app, /professional-event-source-card/); assert.match(app, /sourceRefs\?\.length/); assert.match(css, /max-width:390px/); assert.match(css, /professional-event-source-panel\[hidden\]/);
console.log("PASS  event source DTO, true source count, cross-source badge data, reliability, HTTPS links, disclosure accessibility, and 390px responsive contract");
