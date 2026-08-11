# Yaşayan Defter staging deployment

This document describes a controlled staging simulation and deployment contract. It does not authorize a production database, migration apply, DNS change, or real-school onboarding.

## Topology and boundary

- One persistent Node.js process runs `server.js` on a private app port.
- PostgreSQL is a persistent, separately backed-up service. Staging uses an isolated staging database; local rehearsal uses only `TEST_DATABASE_URL` and the verified `yasayan_defter_test` role/database.
- Nginx (or an equivalent trusted reverse proxy) is the only public ingress and TLS termination point. The Node port must not be internet-accessible.
- The proxy owns HTTP-to-HTTPS redirect, client-IP rate-limit buckets, public request size/time limits, and certificate renewal.
- Application logs go to the process supervisor/journal. `/api/status` is the readiness endpoint; detailed metrics remain private.
- PostgreSQL custom-format backups go to an encrypted, access-controlled path outside the web root, with an off-host copy.

## Environment and preflight

Use `.env.production.example` as the key contract and inject secrets through the deployment secret mechanism. Required variables are `NODE_ENV=production`, `AUTH_MODE=production`, `STORAGE_MODE=postgres`, `DATABASE_URL`, exact canonical HTTPS `APP_ORIGIN`, and `PORT`. Optional bounded variables are `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`, and `LOG_LEVEL`.

For the local staging simulation only, set child-process `DATABASE_URL` from `TEST_DATABASE_URL`; never print either value. Run:

```text
npm run staging:check
npm run test:staging
```

The preflight rejects a non-test connection, non-production modes, a non-HTTPS or non-canonical origin, unavailable/invalid port, wrong DB/role, pending migrations, or missing archive tables. A real staging deployment should replace its test identity allowlist with the separately reviewed staging inventory rather than weakening the test guard.

Start with `npm start` under a supervisor after preflight. Environment assignment belongs to the service manager or secret store, not a committed shell script or `.env` file.

## Reverse proxy and HTTPS

The following is a template, not a ready-to-paste certificate/domain configuration. `limit_req_zone` belongs in Nginx's `http` context. Thresholds are conservative starting points, not an SLA; tune from staged traffic and school policy.

```nginx
limit_req_zone $binary_remote_addr zone=yd_login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=yd_claim:10m rate=3r/m;
limit_req_zone $binary_remote_addr zone=yd_research:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=yd_quiz:10m rate=30r/m;

server {
    listen 80;
    server_name <STAGING_HOST>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name <STAGING_HOST>;
    ssl_certificate <FULLCHAIN_PATH>;
    ssl_certificate_key <PRIVATE_KEY_PATH>;
    client_max_body_size 1m;
    autoindex off;

    location = /api/auth/login { limit_req zone=yd_login burst=5 nodelay; proxy_pass http://127.0.0.1:<APP_PORT>; include <PROXY_HEADERS_FILE>; }
    location = /api/auth/claim { limit_req zone=yd_claim burst=3 nodelay; proxy_pass http://127.0.0.1:<APP_PORT>; include <PROXY_HEADERS_FILE>; }
    location = /api/research { limit_req zone=yd_research burst=5 nodelay; proxy_pass http://127.0.0.1:<APP_PORT>; include <PROXY_HEADERS_FILE>; }
    location ^~ /api/quiz/ { limit_req zone=yd_quiz burst=15 nodelay; proxy_pass http://127.0.0.1:<APP_PORT>; include <PROXY_HEADERS_FILE>; }
    location ~ (^|/)(\.git|\.env|data|backups)(/|$) { return 404; }
    location / { proxy_pass http://127.0.0.1:<APP_PORT>; include <PROXY_HEADERS_FILE>; }
}
```

The included proxy headers must set `Host $host`, `X-Forwarded-Proto https`, `X-Forwarded-For $proxy_add_x_forwarded_for`, use HTTP/1.1, and apply reviewed connect/read/send timeouts. Firewall the Node port so clients cannot bypass the proxy or spoof forwarded headers. Do not set Express `trust proxy=true` globally; it is unnecessary for authorization and unsafe without fixed hop/CIDR ownership.

HTTPS with a trusted CA certificate is mandatory outside local tests. Production cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`. `APP_ORIGIN` is one exact HTTPS origin; allowed same-origin mutations pass, while missing or different origins are denied.

## Backup, retention, and restore

Before every deploy and migration, create `pg_dump --format=custom --no-owner --no-acl`, calculate SHA-256, record a non-secret manifest (timestamp, release, database inventory name, tool version, checksum), and validate with `pg_restore --list`. Suggested policy pending legal approval: daily copies for 14 days, weekly copies for 8 weeks, monthly copies for 12 months, plus pre-deploy/pre-migration snapshots. Keep at least one encrypted off-host copy and test restore quarterly. Retention must ultimately follow the approved KVKK/school policy.

Restore only into an isolated disposable database/schema first. Verify migrations 001–006; users, sessions, schools, classrooms and students; archive tables; and representative source/restored counts. Delete the disposable target and temporary local archive after evidence is recorded.

## Staging acceptance and restart

After deployment, require `/api/status` to return DB healthy, PostgreSQL storage metadata, and no secrets. Run HTTP auth/claim, authorization and critical IDOR checks; real Edge browser teacher/student/claim flows; 390/768/1366 overflow checks; and public exposure/error-contract tests. Expected negative requests are documented, while console errors, page errors, unexpected network failures, stacks, SQL errors, and credential leaks must be zero.

Restart drill: create a DB-backed session and active quiz attempt, gracefully stop the process, start the same release, then verify session and attempt persistence before cleanup. Use `systemd` on Linux as the preferred supervisor (restricted service user, restart limits, environment file permissions, graceful `SIGTERM`). A reviewed Windows Service wrapper is acceptable on Windows. PM2 is an option only if separately approved; no new supervisor dependency is required by the application.

## Operations and promotion

Operators monitor health, structured request/error logs, PostgreSQL pool pressure, provider failures, backup result, disk usage, process RSS, and restart count. Alerts and logs must not contain passwords, cookies, session/claim tokens, raw research/memory text, or database URLs.

STOP promotion on any failed backup/restore, checksum mismatch, pending migration, blocker above zero, dropped record above zero, DB health failure, auth/authorization/IDOR failure, browser smoke failure, public exposure, or residue. Rollback by removing the app from traffic, preserving JSON sources and evidence, restoring the verified DB backup into an isolated target, reverting configuration to the last approved mode, accounting for session invalidation, and repeating smoke before traffic returns.

No domain is assumed purchased. Before go-live, select approved staging/production hostnames, lower DNS TTL ahead of the window, issue certificates, set exact `APP_ORIGIN`, and verify renewal. DNS changes occur only in the authorized cutover window.

Non-code launch requirements are separate gates: KVKK/privacy notice and lawful basis, school agreement and processor roles, operator/admin access, retention, deletion/export, incident response, backup access, and named audit ownership.
