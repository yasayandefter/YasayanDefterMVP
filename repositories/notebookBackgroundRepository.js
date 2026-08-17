"use strict";

const db = require("../db");

async function findByUserId(userId, client = db) {
  const result = await client.query("SELECT user_id, content_type, image_data, byte_size, position, overlay, blur, updated_at FROM notebook_backgrounds WHERE user_id = $1", [userId]);
  return result.rows[0] || null;
}
async function upsert(userId, value, client = db) {
  const result = await client.query("INSERT INTO notebook_backgrounds (user_id, content_type, image_data, byte_size, position, overlay, blur) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id) DO UPDATE SET content_type=EXCLUDED.content_type,image_data=EXCLUDED.image_data,byte_size=EXCLUDED.byte_size,position=EXCLUDED.position,overlay=EXCLUDED.overlay,blur=EXCLUDED.blur,updated_at=NOW() RETURNING user_id, content_type, byte_size, position, overlay, blur, updated_at", [userId, value.contentType, value.data, value.byteSize, value.position, value.overlay, value.blur]);
  return result.rows[0];
}
async function remove(userId, client = db) { return (await client.query("DELETE FROM notebook_backgrounds WHERE user_id = $1", [userId])).rowCount > 0; }

module.exports = { name: "notebookBackgrounds", findByUserId, upsert, remove };
