"use strict";

const MAX_BACKGROUND_BYTES = 900 * 1024;
const CONTENT_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
const POSITIONS = Object.freeze(["center", "top", "bottom"]);

function backgroundError(code) { const error = new Error(code); error.code = code; return error; }
function detectContentType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
function boundedInteger(value, minimum, maximum, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw backgroundError("INVALID_BACKGROUND_SETTINGS");
  return number;
}
function validate(input) {
  const data = input?.data;
  if (!Buffer.isBuffer(data) || data.length === 0 || data.length > MAX_BACKGROUND_BYTES) throw backgroundError("INVALID_BACKGROUND_IMAGE");
  const contentType = String(input?.contentType || "").toLowerCase();
  const detected = detectContentType(data);
  if (!CONTENT_TYPES.includes(contentType) || detected !== contentType) throw backgroundError("INVALID_BACKGROUND_IMAGE");
  const position = input?.position || "center";
  if (!POSITIONS.includes(position)) throw backgroundError("INVALID_BACKGROUND_SETTINGS");
  return { data, contentType, byteSize: data.length, position, overlay: boundedInteger(input?.overlay, 0, 70, 35), blur: boundedInteger(input?.blur, 0, 12, 0) };
}

module.exports = { MAX_BACKGROUND_BYTES, CONTENT_TYPES, POSITIONS, detectContentType, validate };
