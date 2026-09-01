"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("assets/js/research-workspace.js", "utf8");
const css = fs.readFileSync("assets/css/research-workspace-15-6.css", "utf8");
const css158 = fs.readFileSync("assets/css/research-workspace-15-8.css", "utf8");

assert.match(html, /research-workspace-15-6\.css/);
assert.match(html, /research-workspace-15-8\.css/);
assert.match(html, /research-workspace\.js/);
for (const label of ["Genel Bakış", "Görseller", "Kaynaklar", "Quiz", "Zihin Haritası", "Hafıza"]) assert.match(js, new RegExp(label));
assert.match(js, /role: "tablist"/);
assert.match(js, /role: "tab"/);
assert.match(js, /role: "tabpanel"/);
assert.match(js, /aria-selected/);
assert.match(js, /ArrowLeft\|ArrowRight\|Home\|End\|Enter/);
assert.match(js, /document\.getElementById\("saveTopicButton"\)\?\.click/);
assert.doesNotMatch(js, /fetch\s*\(/);
assert.match(js, /overviewOwners = \["visuals", "quiz"\]/);
assert.match(js, /addEventListener\("research:completed"[\s\S]*activate\("overview", false\)/);
assert.match(js, /data-research-owner/);
assert.match(js, /livingMemoryResultBanner/);
assert.match(css, /max-height:min\(62vh,590px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /overflow-x:auto/);
assert.match(css158, /grid-template-areas:"topic topic" "visuals visuals" "quiz progress" "continuation continuation"/);
assert.match(css158, /calc\(\(100% - 24px\)\/5\)/);
assert.match(css158, /html\[data-shell-page="research"\]\.yd-auth-shell/);
assert.doesNotMatch(css158, /\.yd-auth-shell\[data-shell-page=research\]/);
assert.match(css158, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(css158, /url\(https?:|@import|data:image/);
console.log("PASS  15.8 dense Research overview, real-section recomposition, dedicated panels, bounded viewport and responsive contracts");
