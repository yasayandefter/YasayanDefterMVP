"use strict";

// Source prose only: preserve ordinal/abbreviation boundaries and discard
// upstream truncation instead of turning an unfinished fragment into a fact.
function splitSentences(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const protectedText = text.replace(/\b(\d{1,2}|[IVX]{1,5}|Dr|Prof|Doç|Av|St)\.\s+(?=[\p{L}])/gu, '$1\uE000 ');
  return protectedText.split(/(?<=[.!?])\s+(?=["“(]*[\p{Lu}\p{N}])/u)
    .map(part => part.replace(/\uE000/g, '.').trim())
    .filter(part => part.length >= 24 && !/(?:…|\.{3})/.test(part) && /[.!?]["”’')]*$/.test(part))
    .filter(part => (part.match(/\(/g)||[]).length === (part.match(/\)/g)||[]).length);
}
module.exports = { splitSentences };
