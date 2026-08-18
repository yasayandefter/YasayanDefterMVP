"use strict";

const smartNote = require("./smartNote");
const ARCHIVE_STATES = Object.freeze(["active", "archived", "all"]);
const SORT_ORDERS = Object.freeze(["updated", "newest", "oldest", "title"]);
const LIMITS = Object.freeze({ page: 50, defaultPage: 20, presetName: 40, presets: 8, search: 80, offset: 100000 });

function invalid() { const error = new Error("INVALID_NOTE_ORGANIZATION"); error.code = "INVALID_NOTE_ORGANIZATION"; return error; }
function optionalEnum(value, allowed, fallback = "") { const clean = value === undefined || value === null || value === "" ? fallback : String(value); if (clean === "") return ""; if (!allowed.includes(clean)) throw invalid(); return clean; }
function integer(value, fallback, maximum) { if (value === undefined || value === "") return fallback; if (!/^\d+$/.test(String(value))) throw invalid(); const number = Number(value); if (!Number.isSafeInteger(number) || number > maximum) throw invalid(); return number; }
function list(value = {}) { const q=value.q===undefined?"":value.q;if(typeof q!=="string"||q.trim().length>LIMITS.search)throw invalid();return { workspaceArea: optionalEnum(value.workspaceArea || value.area, smartNote.WORKSPACE_AREAS), contentType: optionalEnum(value.contentType || value.type, smartNote.CONTENT_TYPES), archiveState: optionalEnum(value.archive, ARCHIVE_STATES, "active"), sort: optionalEnum(value.sort, SORT_ORDERS, "updated"), search:q.trim(), limit: integer(value.limit, LIMITS.defaultPage, LIMITS.page), offset: integer(value.offset, 0, LIMITS.offset) }; }
function patch(value) { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(); const allowed = new Set(["title","customTitle","content","workspaceArea","contentType","tags","metadata","isPinned","isArchived"]); if (Object.keys(value).some(key => !allowed.has(key))) throw invalid(); const organization = {}; if (value.isPinned !== undefined) { if (typeof value.isPinned !== "boolean") throw invalid(); organization.isPinned = value.isPinned; } if (value.isArchived !== undefined) { if (typeof value.isArchived !== "boolean") throw invalid(); organization.isArchived = value.isArchived; } return organization; }
function preset(value) { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(); const allowed = new Set(["name","workspaceArea","contentType","archiveState","sort"]); if (Object.keys(value).some(key => !allowed.has(key))) throw invalid(); if (typeof value.name !== "string") throw invalid(); const name=value.name.trim(); if (!name || name.length > LIMITS.presetName) throw invalid(); return { name, workspaceArea:optionalEnum(value.workspaceArea,smartNote.WORKSPACE_AREAS)||null, contentType:optionalEnum(value.contentType,smartNote.CONTENT_TYPES)||null, archiveState:optionalEnum(value.archiveState,ARCHIVE_STATES,"active"), sort:optionalEnum(value.sort,SORT_ORDERS,"updated") }; }

module.exports = { ARCHIVE_STATES, SORT_ORDERS, LIMITS, list, patch, preset, invalid };
