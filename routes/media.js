"use strict";

const express = require("express");
const { createMediaService } = require("../services/mediaService");
const { createObjectStorage } = require("../storage/objectStorage");
const { getMediaConfig, publicMediaConfig } = require("../storage/mediaConfig");

const STATUS = { UNAUTHENTICATED: 401, FORBIDDEN: 403, MEDIA_NOT_FOUND: 404, UNSUPPORTED_MEDIA_TYPE: 415, MEDIA_TOO_LARGE: 413, MEDIA_QUOTA_EXCEEDED: 409, MEDIA_OUTSTANDING_LIMIT: 429, MEDIA_UPLOAD_INIT_RATE_LIMIT: 429, MEDIA_OBJECT_MISSING: 409, MEDIA_OBJECT_MISMATCH: 409, MEDIA_NOT_READY: 409, MEDIA_STATE_INVALID: 409, MEDIA_DELETE_RETRY_REQUIRED: 503, MEDIA_STORAGE_DISABLED: 503, MEDIA_STORAGE_CONFIG_INCOMPLETE: 503, MEDIA_STORAGE_PROVIDER_INVALID: 503, MEDIA_STORAGE_UNAVAILABLE: 503 };
const MESSAGES = { UNAUTHENTICATED: "Oturum açmanız gerekiyor.", FORBIDDEN: "Bu medya kaynağına erişim yetkiniz yok.", MEDIA_NOT_FOUND: "Medya kaydı bulunamadı.", UNSUPPORTED_MEDIA_TYPE: "Bu medya türü desteklenmiyor.", MEDIA_TOO_LARGE: "Dosya izin verilen boyutu aşıyor.", MEDIA_QUOTA_EXCEEDED: "Medya kotası aşıldı.", MEDIA_OUTSTANDING_LIMIT: "Devam eden medya yüklemelerini tamamla veya daha sonra yeniden dene.", MEDIA_UPLOAD_INIT_RATE_LIMIT: "Kısa sürede çok fazla yükleme başlatıldı. Lütfen daha sonra yeniden dene.", MEDIA_OBJECT_MISSING: "Yüklenen nesne doğrulanamadı.", MEDIA_OBJECT_MISMATCH: "Yüklenen nesne beklenen dosya bilgileriyle eşleşmiyor.", MEDIA_NOT_READY: "Medya henüz kullanıma hazır değil.", MEDIA_STATE_INVALID: "Medya bu işlem için uygun durumda değil.", MEDIA_DELETE_RETRY_REQUIRED: "Nesne silme işlemi daha sonra yeniden denenmelidir.", MEDIA_STORAGE_DISABLED: "Medya depolama henüz yapılandırılmadı.", MEDIA_STORAGE_CONFIG_INCOMPLETE: "Medya depolama yapılandırması eksik.", MEDIA_STORAGE_PROVIDER_INVALID: "Medya depolama sağlayıcısı geçersiz.", MEDIA_STORAGE_UNAVAILABLE: "Medya depolama şu anda kullanılamıyor.", INVALID_MEDIA_REQUEST: "Medya isteği geçersiz.", INVALID_MEDIA_SIZE: "Dosya boyutu geçersiz.", MEDIA_TYPE_MISMATCH: "Medya türü MIME türüyle eşleşmiyor.", COLLECTION_ACCESS_DENIED: "Koleksiyona erişim reddedildi.", COLLECTION_CAPACITY_EXCEEDED: "Koleksiyon en fazla 100 öğe içerebilir." };

function createMediaRouter(options = {}) {
  const router = express.Router();
  const configFactory = options.configFactory || (req => req.app.locals.mediaConfigFactory ? req.app.locals.mediaConfigFactory(req) : getMediaConfig());
  const storageFactory = options.storageFactory || ((config, req) => req.app.locals.mediaStorageFactory ? req.app.locals.mediaStorageFactory(config, req) : createObjectStorage({ config }));
  function service(req) {
    if (req.repositories?.mode !== "postgres" || !req.repositories.mediaAssets) { const error = new Error("MEDIA_REQUIRES_POSTGRES"); error.code = "MEDIA_REQUIRES_POSTGRES"; error.status = 503; throw error; }
    const config = configFactory(req);
    return createMediaService({ repository: req.repositories.mediaAssets, objectStorage: storageFactory(config, req), config });
  }
  function failure(res, error) { const code = error?.code || "MEDIA_OPERATION_FAILED"; return res.status(error?.status || STATUS[code] || (code === "INVALID_MEDIA_REQUEST" || code === "INVALID_MEDIA_SIZE" || code === "MEDIA_TYPE_MISMATCH" ? 400 : code.startsWith("COLLECTION_") ? 403 : 503)).json({ ok: false, error: { code, message: MESSAGES[code] || "Medya işlemi tamamlanamadı." }, requestId: res.req?.requestId }); }
  const handle = operation => async (req, res) => { try { return await operation(req, res, service(req)); } catch (error) { return failure(res, error); } };

  router.get("/capabilities", handle(async (req, res) => res.json({ ok: true, mediaStorage: req.app.locals.mediaConfigFactory ? (() => { const config = configFactory(req); return { provider: config.provider, available: config.configured, errorCode: config.errorCode, uploadTtlSeconds: config.uploadTtlSeconds, readTtlSeconds: config.readTtlSeconds, maxTotalBytesPerUser: config.maxTotalBytesPerUser, maxAssetCountPerUser: config.maxAssetCountPerUser }; })() : publicMediaConfig(process.env), requestId: req.requestId })));
  router.post("/uploads", handle(async (req, res, media) => res.status(201).json({ ok: true, ...(await media.requestUpload(req.auth, req.body)), requestId: req.requestId })));
  router.post("/:id/complete", handle(async (req, res, media) => res.json({ ok: true, asset: await media.completeUpload(req.auth, req.params.id, req.body), requestId: req.requestId })));
  router.get("/:id/access", handle(async (req, res, media) => res.json({ ok: true, ...(await media.createReadAuthorization(req.auth, req.params.id)), requestId: req.requestId })));
  router.delete("/:id", handle(async (req, res, media) => res.json({ ok: true, ...(await media.deleteAsset(req.auth, req.params.id)), requestId: req.requestId })));
  return router;
}

module.exports = { createMediaRouter };
