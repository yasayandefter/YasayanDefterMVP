"use strict";

const crypto = require("node:crypto");

function createToken() { return crypto.randomBytes(32).toString("base64url"); }
function hashToken(token) { return crypto.createHash("sha256").update(String(token || "")).digest("hex"); }

module.exports = { createToken, hashToken };
