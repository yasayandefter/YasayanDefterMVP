"use strict";

const assert = require("node:assert/strict");
const { createR2Storage } = require("../storage/r2Storage");

class Command { constructor(input) { this.input = input; } }
class S3Client { constructor(options) { this.options = options; this.sent = []; } async send(command) { this.sent.push(command); if (command instanceof HeadObjectCommand) return { ContentLength: 42, ContentType: "application/pdf", ETag: '"etag"' }; return {}; } }
class PutObjectCommand extends Command {} class GetObjectCommand extends Command {} class HeadObjectCommand extends Command {} class DeleteObjectCommand extends Command {}
const signed = [];
async function getSignedUrl(client, command, options) { signed.push({ client, command, options }); return `https://signed.invalid/${command.constructor.name}?token=bearer`; }
const config = { provider: "r2", endpoint: "https://account.r2.cloudflarestorage.com", accountId: "account", accessKeyId: "access-secret", secretAccessKey: "private-secret", bucket: "private-bucket", uploadTtlSeconds: 600, readTtlSeconds: 300 };

(async () => {
  const storage = createR2Storage(config, { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, getSignedUrl });
  const upload = await storage.createUploadAuthorization({ key: "users/hash/media/id/file.pdf", mimeType: "application/pdf", sizeBytes: 42 });
  assert.equal(upload.method, "PUT"); assert.deepEqual(upload.headers, { "Content-Type": "application/pdf" }); assert.deepEqual(upload.signedHeaders, ["content-length", "content-type"]); assert.equal(upload.expectedSizeBytes, 42); assert.equal(signed[0].options.expiresIn, 600); assert.deepEqual([...signed[0].options.signableHeaders], ["content-length", "content-type"]); assert.equal(signed[0].command.input.Bucket, "private-bucket"); assert.equal(signed[0].command.input.ContentType, "application/pdf"); assert.equal(signed[0].command.input.ContentLength, 42);
  const read = await storage.createReadAuthorization({ key: "users/hash/media/id/file.pdf" }); assert.equal(read.method, "GET"); assert.equal(signed[1].options.expiresIn, 300);
  const head = await storage.headObject({ key: "users/hash/media/id/file.pdf" }); assert.deepEqual(head, { exists: true, sizeBytes: 42, mimeType: "application/pdf", etag: "etag" });
  assert.deepEqual(await storage.deleteObject({ key: "users/hash/media/id/file.pdf" }), { deleted: true });
  assert.equal(JSON.stringify({ upload, read, head }).includes("private-secret"), false); assert.equal(JSON.stringify({ upload, read, head }).includes("access-secret"), false);
  console.log("PASS  R2 adapter signed Content-Length/Content-Type PUT contract, HEAD verification, delete and credential isolation");
})().catch(error => { console.error(error); process.exitCode = 1; });
