"use strict";

const AREAS = Object.freeze(["learning", "work", "research", "personal", "creative", "daily_life"]);
const DEFAULT_AREAS = Object.freeze(["research", "personal"]);

function workspaceError() { const error = new Error("INVALID_WORKSPACE"); error.code = "INVALID_WORKSPACE"; return error; }

function normalize(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw workspaceError();
  const allowedKeys = new Set(["selectedAreas", "primaryArea", "onboardingCompleted"]);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) throw workspaceError();
  if (!Array.isArray(value.selectedAreas) || value.selectedAreas.length < 1 || value.selectedAreas.length > AREAS.length) throw workspaceError();
  const selectedAreas = value.selectedAreas.map(area => typeof area === "string" ? area.trim().toLowerCase() : "");
  if (selectedAreas.some(area => !AREAS.includes(area)) || new Set(selectedAreas).size !== selectedAreas.length) throw workspaceError();
  const primaryArea = typeof value.primaryArea === "string" ? value.primaryArea.trim().toLowerCase() : "";
  if (!selectedAreas.includes(primaryArea) || typeof value.onboardingCompleted !== "boolean") throw workspaceError();
  return { selectedAreas, primaryArea, onboardingCompleted: value.onboardingCompleted };
}

function defaults(onboardingCompleted = false) {
  return { selectedAreas: [...DEFAULT_AREAS], primaryArea: "research", onboardingCompleted };
}

function fromStorage(value, onboardingCompleted = false) {
  try { return normalize(typeof value === "string" ? JSON.parse(value) : value); }
  catch (_) { return defaults(onboardingCompleted); }
}

module.exports = { AREAS, DEFAULT_AREAS, normalize, defaults, fromStorage };
