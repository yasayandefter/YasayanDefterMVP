"use strict";

const { getMediaConfig } = require("./mediaConfig");

function unavailable(config) {
  const fail = async () => { const error = new Error(config.errorCode || "MEDIA_STORAGE_UNAVAILABLE"); error.code = config.errorCode || "MEDIA_STORAGE_UNAVAILABLE"; throw error; };
  return Object.freeze({ provider: config.provider, available: false, createUploadAuthorization: fail, createReadAuthorization: fail, headObject: fail, deleteObject: fail });
}

function createObjectStorage(options = {}) {
  const config = options.config || getMediaConfig(options.env);
  if (!config.configured) return unavailable(config);
  if (config.provider === "r2") return require("./r2Storage").createR2Storage(config, options.dependencies);
  return unavailable({ ...config, errorCode: "MEDIA_STORAGE_PROVIDER_INVALID" });
}

module.exports = { createObjectStorage, unavailable };
