"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const pkg = require("../package.json");

const html = fs.readFileSync("index.html", "utf8");
const shell = fs.readFileSync("assets/js/workspace-shell.js", "utf8");
const css = fs.readFileSync("assets/css/home-visual-refinement-15-6.css", "utf8");

assert.match(html, /home-visual-refinement-15-6\.css/);
assert.equal(pkg.version, "15.7.0");
assert.equal(pkg.scripts["test:home-visual-refinement"], "node tests/homeVisualRefinement156.js && node tests/homeVisualRefinementBrowser.js");
assert.match(shell, /Bugün ne üzerinde çalışmak istersin\?/);
assert.match(shell, /Bir konu, fikir veya soru araştır…/);
assert.match(shell, /yd-home-search-icon/);
assert.match(shell, /yd-home-empty/);
assert.match(shell, /Henüz devam eden bir çalışma yok\./);
assert.match(shell, /Bir araştırmaya veya nota başladığında burada görünecek\./);
assert.match(shell, /Yeni araştırma başlat/);
assert.doesNotMatch(shell, /yd-home-secondary/);
assert.equal((shell.match(/\[\["research"/g) || []).length, 1);
for (const selector of ["yd-home-panel", "yd-home-intro", "yd-home-search", "yd-metrics-rail", "yd-metric", "yd-action-grid", "yd-action-card", "yd-suggestions", "yd-home-empty"]) {
  assert.match(css, new RegExp(selector));
}
assert.match(css, /width:min\(1220px,100%\)/);
assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
assert.match(css, /\.yd-home-panel \.workspace-home\{width:100%;max-width:none/);
assert.match(css, /min-height:54px/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(css, /url\(https?:|@import|data:image/);
console.log("PASS  15.6 Home premium canvas, command search, five modules, metric rail, compact continuation and responsive contracts");
