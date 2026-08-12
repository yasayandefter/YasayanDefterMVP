"use strict";

const { sourceById, isAllowedProviderUrl, isAllowedRedirect } = require("./currentSources");
const { parseFeed, parseGeoJson } = require("./feedParser");

const ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json";

async function boundedBody(response, maxBytes, json = false) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("PROVIDER_PAYLOAD_TOO_LARGE");
  if (typeof response.arrayBuffer === "function") {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("PROVIDER_PAYLOAD_TOO_LARGE");
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return json ? JSON.parse(text) : text;
  }
  if (json && typeof response.json === "function") return response.json();
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("PROVIDER_PAYLOAD_TOO_LARGE");
  return json ? JSON.parse(text) : text;
}

async function fetchWithRedirects(source, fetcher, signal, maxRedirects = 2) {
  let url = source.url;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetcher(url, { signal, redirect: "manual", headers: { accept: ACCEPT, "user-agent": "YasayanDefter/14.3 (+keyless-feed-reader)" } });
    if (![301, 302, 303, 307, 308].includes(Number(response.status))) return response;
    const location = response.headers?.get?.("location");
    if (!location || redirects === maxRedirects) throw new Error("PROVIDER_REDIRECT_LIMIT");
    const next = new URL(location, url).href;
    if (!isAllowedRedirect(next, source)) throw new Error("PROVIDER_REDIRECT_BLOCKED");
    url = next;
  }
  throw new Error("PROVIDER_REDIRECT_LIMIT");
}

async function fetchProvider(requestedSource, fetcher = global.fetch, options = {}) {
  const source = sourceById(requestedSource?.id);
  if (!source || requestedSource.url !== source.url || !isAllowedProviderUrl(source.url, source.id)) throw new Error("PROVIDER_NOT_ALLOWLISTED");
  const controller = new AbortController(); const timeoutMs = Math.min(Number(options.timeoutMs) || source.timeoutMs, source.timeoutMs); const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetchWithRedirects(source, fetcher, controller.signal, 2);
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
    if (contentType && source.type === "rss" && !/xml|rss|atom/.test(contentType)) throw new Error("PROVIDER_CONTENT_TYPE");
    if (contentType && source.type === "geojson" && !/json|geo\+json/.test(contentType)) throw new Error("PROVIDER_CONTENT_TYPE");
    const payload = await boundedBody(response, source.maxBytes, source.type === "geojson");
    const items = source.type === "geojson" ? parseGeoJson(payload, source) : parseFeed(payload, source);
    if (!items.length) throw new Error("PROVIDER_EMPTY_OR_INVALID");
    return { source, items, durationMs: Date.now() - startedAt, contentType };
  } finally { clearTimeout(timer); }
}

module.exports = { ACCEPT, boundedBody, fetchWithRedirects, fetchProvider };
