"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),pkg=require("../package.json");
const html=fs.readFileSync("index.html","utf8"),css=fs.readFileSync("assets/css/premium-polish-15-6.css","utf8");
assert.match(html,/premium-polish-15-6\.css/);assert.equal(pkg.scripts["test:premium-polish"],"node tests/premiumPolish156.js && node tests/premiumPolishBrowser.js");
for(const token of ["--ydp-bg","--ydp-surface","--ydp-text","--ydp-muted","--ydp-accent","--ydp-r-md","--ydp-shadow"])assert.match(css,new RegExp(token));
for(const selector of ["yd-shell-nav-item","yd-action-card","yd-research-tab","smart-note-card","collection-card","yd-personal-copy","commercialProfile","focus-visible","prefers-reduced-motion","scrollbar-width"])assert.match(css,new RegExp(selector));
assert.match(css,/min-height:44px/);assert.doesNotMatch(css,/url\(https?:|data:image|@import/);console.log("PASS  15.6 premium tokens, typography, navigation, cards, buttons, internal scrollbars, mobile touch and reduced-motion contracts");
