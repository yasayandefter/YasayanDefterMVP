"use strict";
const assert = require("assert");
const { parseFeed, normalizeGeoJson, isAllowedProviderUrl, searchCurrent, clearCache } = require("../brain/currentProviders");
const { detectFreshness } = require("../brain/freshness");

assert.equal(isAllowedProviderUrl("https://example.com/feed"), false);
assert.equal(isAllowedProviderUrl("file:///tmp/a"), false);
const feed = parseFeed("<rss><channel><item><title>Bilim &amp; Uzay</title><link>https://example.org/a</link><pubDate>Tue, 11 Aug 2026 10:00:00 GMT</pubDate><description><![CDATA[<b>Detay</b>]]></description></item></channel></rss>", { id: "test", name: "Test", trust: "official" });
assert.equal(feed.length, 1); assert.equal(feed[0].title, "Bilim & Uzay"); assert.equal(feed[0].text, "Detay");
const geo = normalizeGeoJson({ features: [{ properties: { title: "M 4.0 - Test", time: Date.now(), mag: 4, url: "https://earthquake.usgs.gov/event" }, geometry: { coordinates: [1, 2, 3] } }] }, { id: "usgs", name: "USGS", trust: "official" });
assert.equal(geo.length, 1); assert.equal(geo[0].magnitude, 4);
clearCache();
searchCurrent("Bugünkü bilim haberleri", detectFreshness("Bugünkü bilim haberleri"), { fetcher: async url => ({ ok: true, text: async () => "<rss><channel><item><title>Bilim gelişmesi</title><link>https://example.org/news</link><pubDate>Tue, 11 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>", json: async () => ({ features: [] }) }) }).then(result => { assert.equal(result.cacheHit, false); assert.ok(Array.isArray(result.items)); return searchCurrent("Bugünkü bilim haberleri", detectFreshness("Bugünkü bilim haberleri"), { fetcher: async url => ({ ok: true, text: async () => "<rss></rss>", json: async () => ({ features: [] }) }) }); }).then(result => { assert.equal(result.cacheHit, true); console.log("Current provider tests: 7 passed, 0 failed"); }).catch(error => { console.error(error); process.exitCode = 1; });
