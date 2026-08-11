"use strict";

function accessMode(env = process.env) {
  return String(env.ACCESS_MODE || (env.VERCEL ? "public-demo" : "local-pilot")).trim().toLowerCase();
}

function effectiveStorageMode(env = process.env) {
  if (accessMode(env) === "public-demo") return "ephemeral";
  return String(env.STORAGE_MODE || "json").trim().toLowerCase();
}

function filesystemPersistenceEnabled(env = process.env) {
  return accessMode(env) !== "public-demo" && effectiveStorageMode(env) === "json";
}

module.exports = { accessMode, effectiveStorageMode, filesystemPersistenceEnabled };
