"use strict";
const assert = require("node:assert/strict");
const { parseFeed, sanitizeText } = require("../brain/feedParser");
const { SOURCES } = require("../brain/currentSources");
const { fetchProvider } = require("../brain/feedProviders");
const { diversify, clusterEvents, searchCurrent, clearCache } = require("../brain/currentProviders");

const provider = SOURCES.find(source => source.id === "nasa-news");
const rss = `<rss><channel><item><title>AI &amp; Science</title><link>https://www.nasa.gov/a</link><pubDate>Wed, 12 Aug 2026 10:00:00 GMT</pubDate><description><![CDATA[<script>bad()</script><b>Safe summary</b><img src="tracker">]]></description></item></channel></rss>`;
const parsed = parseFeed(rss, provider);
assert.equal(parsed.length, 1); assert.equal(parsed[0].title, "AI & Science"); assert.equal(parsed[0].summary, "Safe summary"); assert.equal(parsed[0].publishedAt, "2026-08-12T10:00:00.000Z");
assert.equal(sanitizeText("<iframe>bad</iframe><p>good</p>"), "good");
assert.throws(() => parseFeed(`<!DOCTYPE x [<!ENTITY bad SYSTEM "file:///etc/passwd">]><rss></rss>`, provider), /UNSAFE/);

const response = body => ({ ok: true, status: 200, headers: { get: name => name === "content-type" ? "application/rss+xml" : null }, arrayBuffer: async () => new TextEncoder().encode(body).buffer });
assert.rejects(() => fetchProvider({ ...provider, url: "https://127.0.0.1/feed" }, async () => response(rss)), /ALLOWLISTED/);
assert.rejects(() => fetchProvider(provider, async () => ({ ok: false, status: 302, headers: { get: name => name === "location" ? "https://localhost/private" : null } })), /REDIRECT_BLOCKED/);
assert.rejects(() => fetchProvider(provider, async () => response("x".repeat(provider.maxBytes + 1))), /PAYLOAD_TOO_LARGE/);
assert.rejects(() => fetchProvider(provider, async (url, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("timeout"), { name: "AbortError" })))), { timeoutMs: 15 }), /timeout/);

const diversityInput = Array.from({ length: 10 }, (_, index) => ({ domain: "a.test", title: `A ${index}` })).concat([{ domain: "b.test", title: "B" }, { domain: "c.test", title: "C" }]);
assert.deepEqual(diversify(diversityInput, 5).map(item => item.domain), ["a.test", "b.test", "c.test", "a.test", "a.test"]);
const events = clusterEvents([{ title: "NASA launches new lunar science mission", summary: "One", url: "https://a.test/1", providerId: "a", sourceName: "A", domain: "a.test", publishedAt: "2026-08-12T10:00:00Z" }, { title: "New lunar science mission launched by NASA", summary: "Two", url: "https://b.test/2", providerId: "b", sourceName: "B", domain: "b.test", publishedAt: "2026-08-12T11:00:00Z" }]);
assert.equal(events.length, 1); assert.equal(events[0].crossSourceSupport, 2); assert.equal(events[0].sourceRefs.length, 2);

clearCache();
const validFeed = url => `<rss><channel><item><title>Science research discovery today</title><link>${url}/article</link><pubDate>Wed, 12 Aug 2026 10:00:00 GMT</pubDate><description>New science research result</description></item><item><title>Old science article</title><link>${url}/old</link><pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate><description>Old science result</description></item></channel></rss>`;
const fixtureFetcher = async url => url.includes("microsoft.com") ? response("<rss><broken>") : response(validFeed(new URL(url).origin));
searchCurrent("Bugünkü bilim haberleri", { category: "science", requestedWindow: "day" }, { fetcher: fixtureFetcher, now: Date.parse("2026-08-12T12:00:00Z"), timeoutMs: 50 }).then(result => {
  assert.ok(result.items.length > 0); assert.equal(result.items.some(item => item.title.includes("Old")), false); assert.ok(result.providerErrors.some(error => error.source === "microsoft-research"));
  console.log("PASS  bounded RSS parser, HTML/XXE safety, normalized dates, SSRF/redirect/payload/timeout guards, stale filtering, diversity, clustering, and provider isolation");
}).catch(error => { console.error(error); process.exitCode = 1; });
