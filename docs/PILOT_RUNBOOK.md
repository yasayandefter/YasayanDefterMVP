# Yaşayan Defter Local Pilot Runbook

Bu sürüm Windows üzerinde tek Node process ve kalıcı local disk modeli içindir. Vercel serverless filesystem kalıcı veri deposu değildir.

## Gereksinimler

- Node.js 24.x ile doğrulanmıştır; farklı major sürümlerde Express ve dosya atomikliği tekrar test edilmelidir.
- `npm install` sonrası `npm run pilot:check` çalıştırılmalıdır.

## Başlatma ve kapatma

```text
npm run pilot:check
npm start
```

Sağlık kontrolü: `http://127.0.0.1:3000/api/status`

Windows terminalinde sunucuyu `Ctrl+C` ile kapatın. SIGINT/SIGTERM mevcut isteklerin bitmesini bekler ve process'i kapatır. Port doluysa startup logunda açıkça bildirilir.

## Kalıcı veri envanteri

Authoritative pilot verileri:

- `memory.json`
- `yasayan_deefter_memory.json`
- `data/classrooms.json`
- `data/students.json`
- `data/quiz-attempts.json`

Bu dosyaları, `data/` klasörünü veya `backups/` klasörünü silmeyin. Kaynak kod Git'ten alınabilir; kullanıcı verisi ayrıca korunmalıdır.

## Backup ve doğrulama

```text
npm run backup
npm run backup:verify
npm run backup:verify -- 2026-08-11T10-00-00-000Z
```

Backup'lar `backups/<backup-id>/` altında tutulur. Manifest; sürüm, zaman, uygulama sürümü, logical name, göreli yol, boyut, SHA-256 ve JSON geçerliliğini içerir. Absolute Windows yolu ve içerik yazılmaz.

Öneri: pilot öncesi, pilot sonrası, önemli test öncesi ve günlük kullanımda günlük backup. Otomatik scheduler yoktur.

## Restore

Önce mutlaka dry-run:

```text
npm run restore:dry-run -- 2026-08-11T10-00-00-000Z
npm run restore -- 2026-08-11T10-00-00-000Z
```

Restore manifest/checksum doğrular, canlı verinin safety backup'ını alır, staging alanında JSON doğrular ve dosyaları geçici dosya + rename ile değiştirir. Çoklu JSON dosyaları arasında gerçek filesystem transaction yoktur; safety backup geri dönüş noktasıdır. Corrupt, eksik veya checksum'ı değişmiş backup restore edilmez.

## Recovery

Bir primary JSON bozulursa ilgili `.bak` dosyası `jsonStore`/living memory recovery akışıyla kullanılabilir. Önce process'i durdurun, backup alın, ardından `npm run pilot:check` ve `npm run backup:verify` çalıştırın.

## Sorun durumunda

1. Process'i durdurun.
2. Mevcut live dosyaları değiştirmeden backup alın.
3. `restore:dry-run` ile hedefi doğrulayın.
4. Restore sonrası `/api/status`, smoke ve ilgili domain testlerini çalıştırın.

REST restore endpoint'i yoktur; restore yalnızca local CLI operasyonudur. `backups/` ve `data/` public static olarak servis edilmez. Vercel'de local filesystem kalıcı kabul edilmemelidir.
