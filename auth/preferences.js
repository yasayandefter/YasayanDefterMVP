"use strict";

const THEMES = Object.freeze(["system", "living", "light", "night", "focus"]);
const WRITING_STYLES = Object.freeze(["modern", "classic", "handwriting", "rounded", "minimal"]);
const PAGE_STYLES = Object.freeze(["plain", "lined", "grid", "dotted"]);
const DEFAULT_PREFERENCES = Object.freeze({ theme: "living", notebookWritingStyle: "modern", notebookPageStyle: "plain" });

function preferenceError() { const error = new Error("INVALID_PREFERENCES"); error.code = "INVALID_PREFERENCES"; return error; }
function normalize(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw preferenceError();
  const allowedKeys = new Set(["theme", "notebookWritingStyle", "notebookPageStyle"]);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) throw preferenceError();
  const result = {
    theme: value.theme,
    notebookWritingStyle: value.notebookWritingStyle,
    notebookPageStyle: value.notebookPageStyle
  };
  if (!THEMES.includes(result.theme) || !WRITING_STYLES.includes(result.notebookWritingStyle) || !PAGE_STYLES.includes(result.notebookPageStyle)) throw preferenceError();
  return result;
}
function fromStorage(value) {
  try { return normalize(typeof value === "string" ? JSON.parse(value) : value); }
  catch (_) { return { ...DEFAULT_PREFERENCES }; }
}

module.exports = { THEMES, WRITING_STYLES, PAGE_STYLES, DEFAULT_PREFERENCES, normalize, fromStorage };
