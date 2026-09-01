"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const pkg = require("../package.json");

const html = fs.readFileSync("index.html", "utf8");
const shell = fs.readFileSync("assets/js/workspace-shell.js", "utf8");
const css = fs.readFileSync("assets/css/home-workspace-15-8.css", "utf8");

assert.match(html, /home-visual-refinement-15-6\.css/);
assert.match(html, /home-workspace-15-8\.css/);
assert.equal(pkg.version, "15.7.0");
assert.equal(pkg.scripts["test:home-visual-refinement"], "node tests/homeVisualRefinement156.js && node tests/homeVisualRefinementBrowser.js");
assert.match(shell, /Merakını bir sonraki çalışmana dönüştür\./);
assert.match(shell, /Bir konu, fikir veya soru araştır…/);
assert.match(shell, /yd-home-search-icon/);
assert.match(shell, /yd-home-empty/);
assert.match(shell, /Henüz devam eden bir çalışma yok\./);
assert.match(shell, /Bir araştırmaya veya nota başladığında burada görünecek\./);
assert.match(shell, /Yeni araştırma başlat/);
assert.doesNotMatch(shell, /yd-home-secondary/);
assert.equal((shell.match(/\[\["research"/g) || []).length, 1);
for (const selector of ["yd-home-panel", "yd-home-intro", "yd-home-search", "yd-metrics-rail", "yd-metric", "yd-home-actions", "yd-action-grid", "yd-action-card", "yd-home-continuity", "yd-suggestions", "yd-home-empty"]) {
  assert.match(css, new RegExp(selector));
}
assert.match(css, /width:min\(1240px,100%\)/);
assert.match(css, /grid-template-areas:"command metrics" "actions actions" "continuity continuity"/);
assert.match(css, /grid-template-columns:1\.35fr repeat\(4,minmax\(0,1fr\)\)/);
assert.match(css, /data-action-page=research/);
assert.match(css, /overflow-y:hidden/);
assert.match(css, /min-height:52px/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(css, /url\(https?:|@import|data:image/);
console.log("PASS  15.8 Home command, differentiated destinations, integrated progress, continuity and responsive contracts");
