"use strict";

function sdk(dependencies = {}) {
  if (dependencies.S3Client) return dependencies;
  const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  return { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, getSignedUrl };
}

function createR2Storage(config, dependencies = {}) {
  const api = sdk(dependencies);
  const client = dependencies.client || new api.S3Client({ region: "auto", endpoint: config.endpoint, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  return Object.freeze({
    provider: "r2",
    available: true,
    async createUploadAuthorization({ key, mimeType, sizeBytes }) {
      const signedHeaders = new Set(["content-length", "content-type"]);
      const command = new api.PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: mimeType, ContentLength: sizeBytes });
      return { url: await api.getSignedUrl(client, command, { expiresIn: config.uploadTtlSeconds, signableHeaders: signedHeaders }), method: "PUT", headers: { "Content-Type": mimeType }, signedHeaders: [...signedHeaders], expectedSizeBytes: sizeBytes, expiresInSeconds: config.uploadTtlSeconds };
    },
    async createReadAuthorization({ key }) {
      const command = new api.GetObjectCommand({ Bucket: config.bucket, Key: key });
      return { url: await api.getSignedUrl(client, command, { expiresIn: config.readTtlSeconds }), method: "GET", expiresInSeconds: config.readTtlSeconds };
    },
    async headObject({ key }) {
      try {
        const value = await client.send(new api.HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return { exists: true, sizeBytes: Number(value.ContentLength), mimeType: String(value.ContentType || "").toLowerCase(), etag: String(value.ETag || "").replace(/^"|"$/g, "") || null };
      } catch (error) {
        if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) return { exists: false };
        throw error;
      }
    },
    async deleteObject({ key }) { await client.send(new api.DeleteObjectCommand({ Bucket: config.bucket, Key: key })); return { deleted: true }; }
  });
}

module.exports = { createR2Storage };
