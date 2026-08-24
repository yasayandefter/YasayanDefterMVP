"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("assets/js/research-workspace.js", "utf8");
const css = fs.readFileSync("assets/css/research-workspace-15-6.css", "utf8");

assert.match(html, /research-workspace-15-6\.css/);
assert.match(html, /research-workspace\.js/);
for (const label of ["Genel Bakış", "Görseller", "Kaynaklar", "Quiz", "Zihin Haritası", "Hafıza"]) assert.match(js, new RegExp(label));
assert.match(js, /role: "tablist"/);
assert.match(js, /role: "tab"/);
assert.match(js, /role: "tabpanel"/);
assert.match(js, /aria-selected/);
assert.match(js, /ArrowLeft\|ArrowRight\|Home\|End\|Enter/);
assert.match(js, /document\.getElementById\("saveTopicButton"\)\?\.click/);
assert.doesNotMatch(js, /fetch\s*\(/);
assert.match(css, /max-height:min\(62vh,590px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /overflow-x:auto/);
console.log("PASS  15.6 research workspace tabs, panels, save proxy, bounded viewport, responsive and reduced-motion contracts");
