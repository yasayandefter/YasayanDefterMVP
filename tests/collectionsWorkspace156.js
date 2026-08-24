"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("index.html","utf8"),js=fs.readFileSync("assets/js/collections-workspace.js","utf8"),css=fs.readFileSync("assets/css/collections-workspace-15-6.css","utf8"),pkg=require("../package.json");
assert.match(html,/collections-workspace-15-6\.css/);assert.match(html,/collections-workspace\.js/);assert.equal(pkg.scripts["test:collections-workspace"],"node tests/collectionsWorkspace156.js && node tests/collectionsWorkspaceBrowser.js");
for(const contract of ["collectionsWorkspace156","data-collection-view","Koleksiyon görünümü","MutationObserver","keydown","aria-pressed"])assert.match(js,new RegExp(contract));
for(const contract of ["overflow:auto","repeat\\(4","repeat\\(2","max-width:540px","prefers-reduced-motion","focus-visible"])assert.match(css,new RegExp(contract));
assert.doesNotMatch(js,/upload|type=["']file|audio|video|pdf/i);assert.doesNotMatch(js,/innerHTML/);console.log("PASS  premium bounded collections workspace, grid/list, keyboard, responsive and no fake media controls");
