"use strict";

function validateAuthOrigin(req, config) {
  if (config.authMode !== "production") return true;
  const origin = req.get("origin");
  if (!origin || !config.appOrigins.length) return !config.appOrigins.length;
  return config.appOrigins.includes(origin);
}

module.exports = { validateAuthOrigin };
