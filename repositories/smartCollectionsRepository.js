"use strict";

const crypto = require("node:crypto");
const db = require("../db");
const { mapDatabaseError } = require("./errors");
const memory = require("./memoryRepository");
const { normalize } = require("../services/contextIntelligence");

function scope(owner, alias = "c") {
  return owner && owner.kind === "user"
    ? { column: `${alias}.owner_user_id`, id: owner.id, userId: owner.id, studentId: null }
    : { column: `${alias}.student_id`, id: owner, userId: null, studentId: owner };
}

function map(row) {
  return row && {
    id: row.id,
    name: row.name,
    description: row.description || "",
    workspaceArea: row.workspace_area || "",
    recordCount: Number(row.record_count || 0),
    mediaCount: Number(row.media_count || 0),
    itemCount: Number(row.item_count ?? (Number(row.record_count || 0) + Number(row.media_count || 0))),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

function mapMedia(row) {
  return row && {
    id: row.id,
    originalFilename: row.original_filename,
    safeFilename: row.safe_filename,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    addedAt: row.added_at instanceof Date ? row.added_at.toISOString() : row.added_at
  };
}

const COUNTS_SQL = `
  (SELECT COUNT(*) FROM smart_collection_items ni WHERE ni.collection_id=c.id)::int AS record_count,
  (SELECT COUNT(*) FROM smart_collection_media_items mi JOIN media_assets ma ON ma.id=mi.media_asset_id WHERE mi.collection_id=c.id AND ma.status='READY')::int AS media_count,
  ((SELECT COUNT(*) FROM smart_collection_items ni WHERE ni.collection_id=c.id) +
   (SELECT COUNT(*) FROM smart_collection_media_items mi JOIN media_assets ma ON ma.id=mi.media_asset_id WHERE mi.collection_id=c.id AND ma.status='READY'))::int AS item_count`;

async function list(owner, options = {}, client = db) {
  const s = scope(owner);
  const order = {
    updated: "c.updated_at DESC,c.id",
    name: "LOWER(c.name),c.id",
    count: "item_count DESC,c.updated_at DESC,c.id"
  }[options.sort] || "c.updated_at DESC,c.id";
  const values = [s.id];
  const filter = [];
  if (options.q) {
    values.push(`%${String(options.q).toLocaleLowerCase("tr-TR")}%`);
    filter.push(`(LOWER(c.name) LIKE $${values.length} OR LOWER(c.description) LIKE $${values.length})`);
  }
  values.push(Math.min(50, options.limit || 20));
  try {
    const result = await client.query(`SELECT c.*,${COUNTS_SQL} FROM smart_collections c WHERE ${s.column}=$1 ${filter.length ? `AND ${filter.join(" AND ")}` : ""} ORDER BY ${order} LIMIT $${values.length}`, values);
    return result.rows.map(map);
  } catch (error) {
    throw mapDatabaseError(error, "COLLECTION_LIST_FAILED");
  }
}

async function listMedia(id, owner, client = db) {
  const s = scope(owner);
  try {
    const result = await client.query(`WITH target AS (SELECT id FROM smart_collections WHERE id=$1), owned AS (SELECT c.id FROM smart_collections c WHERE c.id=$1 AND ${s.column}=$2) SELECT EXISTS(SELECT 1 FROM target) exists,EXISTS(SELECT 1 FROM owned) owned`, [id, s.id]);
    const state = result.rows[0] || {};
    if (!state.owned) return { exists: Boolean(state.exists), owned: false, media: [] };
    const media = (await client.query("SELECT a.*,i.added_at FROM smart_collection_media_items i JOIN media_assets a ON a.id=i.media_asset_id WHERE i.collection_id=$1 AND a.status='READY' ORDER BY i.added_at,a.id LIMIT 100", [id])).rows.map(mapMedia);
    return { exists: true, owned: true, media };
  } catch (error) {
    throw mapDatabaseError(error, "COLLECTION_MEDIA_LIST_FAILED");
  }
}

async function findOwned(id, owner, client = db) {
  const s = scope(owner);
  try {
    const result = await client.query(`WITH target AS (SELECT id FROM smart_collections WHERE id=$1), owned AS (SELECT c.*,${COUNTS_SQL} FROM smart_collections c WHERE c.id=$1 AND ${s.column}=$2) SELECT EXISTS(SELECT 1 FROM target) exists,(SELECT row_to_json(owned) FROM owned) collection`, [id, s.id]);
    const row = result.rows[0] || {};
    if (!row.collection) return { exists: Boolean(row.exists), collection: null, members: [], mediaMembers: [] };
    const members = (await client.query(`SELECT m.* FROM smart_collection_items i JOIN memory_records m ON m.id=i.memory_record_id JOIN smart_collections c ON c.id=i.collection_id WHERE i.collection_id=$1 AND ${s.column}=$2 ORDER BY i.added_at,m.id LIMIT 100`, [id, s.id])).rows.map(memory.mapMemory);
    const mediaMembers = (await listMedia(id, owner, client)).media;
    return { exists: true, collection: map(row.collection), members, mediaMembers };
  } catch (error) {
    throw mapDatabaseError(error, "COLLECTION_DETAIL_FAILED");
  }
}

async function create(owner, value, client = db) {
  const s = scope(owner), id = crypto.randomUUID(), recordIds = value.recordIds;
  try {
    const result = await client.query(`WITH owned AS (SELECT id FROM memory_records m WHERE id=ANY($7::uuid[]) AND ${scope(owner, "m").column}=$1), valid AS (SELECT COUNT(*)::int n FROM owned HAVING COUNT(*)=$8), inserted AS (INSERT INTO smart_collections(id,owner_user_id,student_id,name,normalized_name,description,workspace_area) SELECT $2,$3,$4,$5,$6,$9,$10 FROM valid RETURNING *), items AS (INSERT INTO smart_collection_items(collection_id,memory_record_id) SELECT inserted.id,owned.id FROM inserted CROSS JOIN owned RETURNING memory_record_id) SELECT (SELECT row_to_json(inserted) FROM inserted) collection,(SELECT COUNT(*)::int FROM items) record_count`, [s.id, id, s.userId, s.studentId, value.name, normalize(value.name), recordIds, recordIds.length, value.description, value.workspaceArea]);
    const row = result.rows[0];
    return row?.collection ? { collection: map({ ...row.collection, record_count: row.record_count, media_count: 0, item_count: row.record_count }), foreign: false } : { collection: null, foreign: true };
  } catch (error) {
    throw mapDatabaseError(error, "COLLECTION_CREATE_FAILED");
  }
}

async function update(id, owner, value, client = db) {
  const s = scope(owner);
  try {
    const result = await client.query(`WITH target AS (SELECT id FROM smart_collections WHERE id=$1), updated AS (UPDATE smart_collections c SET name=COALESCE($3,name),normalized_name=CASE WHEN $3 IS NULL THEN normalized_name ELSE $4 END,description=COALESCE($5,description),workspace_area=CASE WHEN $6::boolean THEN $7 ELSE workspace_area END,updated_at=NOW() WHERE id=$1 AND ${s.column}=$2 RETURNING *) SELECT EXISTS(SELECT 1 FROM target) exists,(SELECT row_to_json(updated) FROM updated) collection`, [id, s.id, value.name || null, value.name ? normalize(value.name) : null, value.description === undefined ? null : value.description, Object.hasOwn(value, "workspaceArea"), value.workspaceArea]);
    return { exists: Boolean(result.rows[0]?.exists), collection: map(result.rows[0]?.collection) };
  } catch (error) {
    throw mapDatabaseError(error, "COLLECTION_UPDATE_FAILED");
  }
}

async function addItems(id, owner, recordIds, client = db) {
  const s = scope(owner), ms = scope(owner, "m");
  const run = async connection => {
    const result = await connection.query(`WITH collection AS (SELECT id FROM smart_collections c WHERE id=$1 AND ${s.column}=$2 FOR UPDATE), owned AS (SELECT id FROM memory_records m WHERE id=ANY($3::uuid[]) AND ${ms.column}=$2), candidates AS (SELECT owned.id FROM owned WHERE NOT EXISTS(SELECT 1 FROM smart_collection_items i WHERE i.collection_id=$1 AND i.memory_record_id=owned.id)), capacity AS (SELECT collection.id FROM collection WHERE (SELECT COUNT(*) FROM smart_collection_items WHERE collection_id=$1)+(SELECT COUNT(*) FROM smart_collection_media_items WHERE collection_id=$1)+(SELECT COUNT(*) FROM candidates)<=100), added AS (INSERT INTO smart_collection_items(collection_id,memory_record_id) SELECT capacity.id,candidates.id FROM capacity CROSS JOIN candidates ON CONFLICT DO NOTHING RETURNING memory_record_id) SELECT (SELECT COUNT(*) FROM owned)::int owned_count,(SELECT COUNT(*) FROM candidates)::int candidate_count,(SELECT COUNT(*) FROM added)::int added_count,EXISTS(SELECT 1 FROM collection) collection_exists,EXISTS(SELECT 1 FROM capacity) capacity_ok`, [id, s.id, recordIds]);
    return result.rows[0];
  };
  try { return client ? await run(client) : await db.withTransaction(run); }
  catch (error) { throw mapDatabaseError(error, "COLLECTION_ADD_FAILED"); }
}

async function addMedia(id, owner, userId, mediaAssetIds, client = db) {
  const s = scope(owner);
  const run = async connection => {
    const result = await connection.query(`WITH collection AS (SELECT id FROM smart_collections c WHERE id=$1 AND ${s.column}=$2 FOR UPDATE), owned AS (SELECT id FROM media_assets WHERE id=ANY($4::uuid[]) AND user_id=$3 AND status='READY'), candidates AS (SELECT owned.id FROM owned WHERE NOT EXISTS(SELECT 1 FROM smart_collection_media_items i WHERE i.collection_id=$1 AND i.media_asset_id=owned.id)), capacity AS (SELECT collection.id FROM collection WHERE (SELECT COUNT(*) FROM smart_collection_items WHERE collection_id=$1)+(SELECT COUNT(*) FROM smart_collection_media_items WHERE collection_id=$1)+(SELECT COUNT(*) FROM candidates)<=100), added AS (INSERT INTO smart_collection_media_items(collection_id,media_asset_id) SELECT capacity.id,candidates.id FROM capacity CROSS JOIN candidates ON CONFLICT DO NOTHING RETURNING media_asset_id) SELECT (SELECT COUNT(*) FROM owned)::int owned_count,(SELECT COUNT(*) FROM candidates)::int candidate_count,(SELECT COUNT(*) FROM added)::int added_count,EXISTS(SELECT 1 FROM collection) collection_exists,EXISTS(SELECT 1 FROM capacity) capacity_ok`, [id, s.id, userId, mediaAssetIds]);
    return result.rows[0];
  };
  try { return client ? await run(client) : await db.withTransaction(run); }
  catch (error) { throw mapDatabaseError(error, "COLLECTION_MEDIA_ADD_FAILED"); }
}

async function removeItem(id, recordId, owner, client = db) {
  const s = scope(owner);
  try {
    const result = await client.query(`WITH collection AS (SELECT id FROM smart_collections c WHERE id=$1 AND ${s.column}=$3), removed AS (DELETE FROM smart_collection_items WHERE collection_id IN(SELECT id FROM collection) AND memory_record_id=$2 RETURNING memory_record_id) SELECT EXISTS(SELECT 1 FROM smart_collections WHERE id=$1) exists,EXISTS(SELECT 1 FROM collection) owned,EXISTS(SELECT 1 FROM removed) removed`, [id, recordId, s.id]);
    return result.rows[0];
  } catch (error) { throw mapDatabaseError(error, "COLLECTION_REMOVE_FAILED"); }
}

async function removeMedia(id, mediaId, owner, userId, client = db) {
  const s = scope(owner);
  try {
    const result = await client.query(`WITH collection AS (SELECT id FROM smart_collections c WHERE id=$1 AND ${s.column}=$3), owned_asset AS (SELECT id FROM media_assets WHERE id=$2 AND user_id=$4), removed AS (DELETE FROM smart_collection_media_items WHERE collection_id IN(SELECT id FROM collection) AND media_asset_id IN(SELECT id FROM owned_asset) RETURNING media_asset_id) SELECT EXISTS(SELECT 1 FROM smart_collections WHERE id=$1) exists,EXISTS(SELECT 1 FROM collection) owned,EXISTS(SELECT 1 FROM media_assets WHERE id=$2) asset_exists,EXISTS(SELECT 1 FROM owned_asset) asset_owned,EXISTS(SELECT 1 FROM removed) removed`, [id, mediaId, s.id, userId]);
    return result.rows[0];
  } catch (error) { throw mapDatabaseError(error, "COLLECTION_MEDIA_REMOVE_FAILED"); }
}

async function deleteOwned(id, owner, client = db) {
  const s = scope(owner);
  try {
    const result = await client.query(`WITH target AS(SELECT id FROM smart_collections WHERE id=$1),deleted AS(DELETE FROM smart_collections c WHERE id=$1 AND ${s.column}=$2 RETURNING id) SELECT EXISTS(SELECT 1 FROM target) exists,EXISTS(SELECT 1 FROM deleted) deleted`, [id, s.id]);
    return result.rows[0];
  } catch (error) { throw mapDatabaseError(error, "COLLECTION_DELETE_FAILED"); }
}

async function relatedMemberIds(recordId, owner, client = db) {
  const s = scope(owner);
  try {
    return new Set((await client.query(`SELECT DISTINCT other.memory_record_id id FROM smart_collection_items own JOIN smart_collections c ON c.id=own.collection_id JOIN smart_collection_items other ON other.collection_id=own.collection_id WHERE own.memory_record_id=$1 AND ${s.column}=$2 AND other.memory_record_id<>$1 LIMIT 100`, [recordId, s.id])).rows.map(row => row.id));
  } catch (error) { throw mapDatabaseError(error, "COLLECTION_CONTEXT_FAILED"); }
}

module.exports = { name: "smartCollections", scope, map, mapMedia, list, listMedia, findOwned, create, update, addItems, addMedia, removeItem, removeMedia, deleteOwned, relatedMemberIds };
