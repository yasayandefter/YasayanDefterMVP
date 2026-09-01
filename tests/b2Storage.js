"use strict";

const assert = require("node:assert/strict");
const { createB2Storage } = require("../storage/b2Storage");
const { createObjectStorage } = require("../storage/objectStorage");
const { getMediaConfig, publicMediaConfig } = require("../storage/mediaConfig");
const { storageKey, safeFilename } = require("../services/mediaService");

class Command { constructor(input) { this.input = input; } }
class S3Client { constructor(options) { this.options = options; this.sent = []; S3Client.instances.push(this); } async send(command) { this.sent.push(command); if (command instanceof HeadObjectCommand) return { ContentLength: 42, ContentType: "Application/PDF", ETag: '"b2-etag"' }; return {}; } }
S3Client.instances = [];
class PutObjectCommand extends Command {} class GetObjectCommand extends Command {} class HeadObjectCommand extends Command {} class DeleteObjectCommand extends Command {}
const signed = [];
async function getSignedUrl(client, command, options) { signed.push({ client, command, options }); return `https://signed.invalid/${command.constructor.name}?token=bearer`; }
const dependencies = { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, getSignedUrl };
const env = { MEDIA_STORAGE_PROVIDER: "b2", B2_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com", B2_REGION: "eu-central-003", B2_BUCKET_NAME: "yasayan-defter-media", B2_KEY_ID: "key-id-secret", B2_APPLICATION_KEY: "application-key-secret", MEDIA_UPLOAD_URL_TTL_SECONDS: "600", MEDIA_READ_URL_TTL_SECONDS: "420" };

(async () => {
  const config = getMediaConfig(env);
  assert.equal(config.configured, true); assert.equal(config.endpoint, env.B2_ENDPOINT); assert.equal(config.region, env.B2_REGION); assert.equal(config.bucket, env.B2_BUCKET_NAME);
  assert.equal(JSON.stringify(publicMediaConfig(env)).includes("key-id-secret"), false); assert.equal(JSON.stringify(publicMediaConfig(env)).includes("application-key-secret"), false);
  for (const missing of ["B2_ENDPOINT", "B2_REGION", "B2_BUCKET_NAME", "B2_KEY_ID", "B2_APPLICATION_KEY"]) { const malformed = { ...env }; delete malformed[missing]; assert.equal(getMediaConfig(malformed).errorCode, "MEDIA_STORAGE_CONFIG_INCOMPLETE"); }
  assert.equal(getMediaConfig({ ...env, MEDIA_READ_URL_TTL_SECONDS: "oops" }).errorCode, "MEDIA_STORAGE_CONFIG_INVALID");

  const storage = createObjectStorage({ env, dependencies });
  assert.equal(storage.provider, "b2"); assert.equal(storage.available, true);
  const client = S3Client.instances[0];
  assert.equal(client.options.endpoint, env.B2_ENDPOINT); assert.equal(client.options.region, env.B2_REGION); assert.equal(client.options.forcePathStyle, undefined);
  assert.deepEqual(client.options.credentials, { accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APPLICATION_KEY });
  const key = "users/hash/media/id/file.pdf";
  const upload = await storage.createUploadAuthorization({ key, mimeType: "application/pdf", sizeBytes: 42 });
  assert.deepEqual(upload.headers, { "Content-Type": "application/pdf" }); assert.deepEqual(upload.signedHeaders, ["content-length", "content-type"]); assert.equal(upload.expectedSizeBytes, 42); assert.equal(upload.expiresInSeconds, 600); assert.equal(signed[0].options.expiresIn, 600); assert.deepEqual([...signed[0].options.signableHeaders], ["content-length", "content-type"]); assert.deepEqual(signed[0].command.input, { Bucket: env.B2_BUCKET_NAME, Key: key, ContentType: "application/pdf", ContentLength: 42 });
  const read = await storage.createReadAuthorization({ key }); assert.equal(read.method, "GET"); assert.equal(read.expiresInSeconds, 420); assert.equal(signed[1].options.expiresIn, 420);
  const head = await storage.headObject({ key }); assert.deepEqual(head, { exists: true, sizeBytes: 42, mimeType: "application/pdf", etag: "b2-etag" });
  assert.deepEqual(await storage.deleteObject({ key }), { deleted: true }); assert.equal(client.sent.at(-1).input.Bucket, env.B2_BUCKET_NAME);
  assert.equal(JSON.stringify({ upload, read, head }).includes(env.B2_KEY_ID), false); assert.equal(JSON.stringify({ upload, read, head }).includes(env.B2_APPLICATION_KEY), false);
  assert.equal(createObjectStorage({ env: { MEDIA_STORAGE_PROVIDER: "mock" } }).provider, "mock");
  assert.equal(createObjectStorage({ env: { MEDIA_STORAGE_PROVIDER: "b2" } }).available, false);
  const realSigned = await createB2Storage({ ...config, endpoint: "https://s3.invalid", region: "test-region", bucket: "test-bucket", accessKeyId: "fixture-access", secretAccessKey: "fixture-secret" }).createUploadAuthorization({ key, mimeType: "application/pdf", sizeBytes: 42 });
  const signedHeaderNames = String(new URL(realSigned.url).searchParams.get("X-Amz-SignedHeaders") || "").split(";"); assert.ok(signedHeaderNames.includes("content-length")); assert.ok(signedHeaderNames.includes("content-type"));
  const secure = storageKey("owner@example.invalid", "11111111-1111-4111-8111-111111111111", safeFilename("../../private/report.pdf"));
  assert.match(secure, /^users\/[0-9a-f]{24}\/media\/11111111-1111-4111-8111-111111111111\/report\.pdf$/); assert.equal(secure.includes("owner@example.invalid"), false); assert.equal(secure.includes(".."), false);
  console.log("PASS  B2 config, signed Content-Length/Content-Type PUT contract, HEAD, delete, key security and credential isolation");
})().catch(error => { console.error(error); process.exitCode = 1; });
