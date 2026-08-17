"use strict";
const assert = require("node:assert/strict");
const prefs = require("../auth/preferences");
const service = require("../services/authService");

assert.deepEqual(prefs.normalize({ theme:"living", notebookWritingStyle:"modern", notebookPageStyle:"plain" }), { theme:"living", notebookWritingStyle:"modern", notebookPageStyle:"plain" });
for (const bad of [
  { theme:"x", notebookWritingStyle:"modern", notebookPageStyle:"plain" },
  { theme:"living", notebookWritingStyle:"<script>", notebookPageStyle:"plain" },
  { theme:"living", notebookWritingStyle:"modern", notebookPageStyle:"url(javascript:1)" },
  { theme:"living", notebookWritingStyle:"modern", notebookPageStyle:"plain", role:"TEACHER" }
]) assert.throws(() => prefs.normalize(bad), /INVALID_PREFERENCES/);

(async () => {
  let written;
  const result = await service.updatePreferences("token", { theme:"focus", notebookWritingStyle:"minimal", notebookPageStyle:"grid", userId:"spoof", role:"TEACHER" }, {
    sessions: { findValidSession: async () => ({ user_id:"owner", student_id:"student-link" }) },
    users: { updatePreferences: async (id, value) => { assert.equal(id,"owner"); written=prefs.normalize(value); return { id, role:"STUDENT", status:"ACTIVE", student_id:"student-link", ui_preferences:written }; }, safeUser: value => value }
  }).catch(error => { throw error; });
  assert.equal(result.user.id,"owner"); assert.equal(result.user.role,"STUDENT"); assert.deepEqual(written,{theme:"focus",notebookWritingStyle:"minimal",notebookPageStyle:"grid"});
  assert.match(require("node:fs").readFileSync("assets/js/personalization.js","utf8"), /prefers-color-scheme|aria-live|type = "radio"/);
  console.log("PASS  personalization whitelists, defaults, session authority, mass assignment, local safety, system theme, and accessible controls");
})().catch(error => { console.error(error); process.exitCode=1; });
