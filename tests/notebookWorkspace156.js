"use strict";
const assert = require("node:assert/strict"); const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8"), js = fs.readFileSync("assets/js/notebook-workspace.js", "utf8"), css = fs.readFileSync("assets/css/notebook-workspace-15-6.css", "utf8");
assert.match(html, /notebook-workspace-15-6\.css/); assert.match(html, /notebook-workspace\.js/);
for (const area of ["Tümü", "Öğrenme", "İş", "Araştırma", "Kişisel", "Üretim", "Günlük Yaşam"]) assert.match(js, new RegExp(area));
assert.match(js, /smartNoteArea/); assert.match(js, /smartNoteSearch/); assert.match(js, /smartNoteMore/); assert.match(js, /smart-note-presets/); assert.match(js, /Notların, araştırmaların ve fikirlerin/);
assert.match(js, /\/api\/memory\/list/); assert.match(js, /\/api\/intelligence\/context/); assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML/);
assert.match(css, /grid-template-columns:190px minmax\(0,1fr\)/); assert.match(css, /overflow:auto/); assert.match(css, /prefers-reduced-motion:reduce/); assert.match(css, /max-width:620px/);
console.log("PASS  15.6 Defterim workspace header, area rail, filters, bounded grid, lazy detail, accessibility and responsive contracts");
