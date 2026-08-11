# Yaşayan Defter production cutover runbook

This runbook is a readiness contract. Phase 7 does not authorize a production migration, DNS change, or storage cutover.

## Deployment contract

Required environment:

- `NODE_ENV=production`
- `PORT` set to the platform-assigned internal HTTP port
- `AUTH_MODE=production`
- `STORAGE_MODE=postgres`
- `DATABASE_URL` supplied by the secret manager
- `APP_ORIGIN` set to the exact public HTTPS origin

Optional bounded settings are `PG_POOL_MAX` (1–50), `PG_IDLE_TIMEOUT_MS` (1,000–300,000), `PG_CONNECTION_TIMEOUT_MS` (1,000–60,000), and `LOG_LEVEL` (`debug` is normalized to `info` in production).

Use one persistent Node service behind a managed HTTPS reverse proxy and a PostgreSQL service. TLS terminates at the proxy. Forward the original `Host` and `X-Forwarded-Proto=https`, but do not enable broad Express `trust proxy` without an explicit, fixed proxy-hop/CIDR contract. The application does not use forwarded client IP as an authorization signal.

The proxy or edge must rate-limit, at minimum, `/api/auth/login`, `/api/auth/claim`, `/api/research`, and `/api/quiz/*`. Prefer per-account plus proxy-verified client-IP limits with short bursts, progressive backoff for auth, a stricter claim limit, and bounded research/quiz concurrency. The application intentionally has no process-local IP limiter because it would be inconsistent across replicas and unsafe without a trusted proxy/IP contract.

HTTPS is mandatory. The production session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`; it will not function on an ordinary non-HTTPS public origin.

## Preflight

1. Freeze writes and record the release commit and immutable pilot tag.
2. Verify required environment variables by presence only. Never print `DATABASE_URL`.
3. Confirm the target database and role with `current_database()` and `current_user` against the approved production inventory.
4. Run `npm run db:check`, `npm run db:status`, and `npm run db:migrate` under a reviewed change window.
5. Confirm migrations 001–006, constraints, available disk space, PostgreSQL version, pool sizing, HTTPS origin, reverse-proxy timeouts, and edge rate limits.

## Source and database backups

1. Stop or freeze JSON pilot writes.
2. Run the existing JSON backup and verification workflow.
3. Compute SHA-256 checksums for every migration source and store the manifest separately.
4. Create a PostgreSQL custom-format backup with `pg_dump --format=custom --no-owner --no-acl`.
5. Verify the archive with `pg_restore --list` and restore it into an isolated disposable database.
6. Validate `schema_migrations`, active tables, archive tables, constraints, and representative counts.
7. Keep encrypted, access-controlled, off-host copies under an approved retention schedule; periodically rehearse restore.

## Migration rehearsal and gate

1. Run `npm run db:migration:dry-run` with the approved mapping policies.
2. Preserve `--map-legacy-default`, `--reconcile-orphan-students`, and `--quarantine-unresolved-legacy` decisions.
3. Require `ACTIVE BLOCKERS = 0`, `DROPPED RECORDS = 0`, and unchanged source checksums.
4. Review active and quarantine counts. Quarantine must not produce users, memberships, XP, mastery, progress, or teacher summaries.
5. The current importer reports `APPLY_DISABLED_IN_PHASE_4`. Do not bypass it. Production apply requires a separately reviewed implementation and the safeguards declared by the source contract: `--apply`, `--snapshot-hash`, `--confirm`, `--confirm-legacy-owner`, `--confirm-orphan-reconciliation`, `--quarantine-unresolved-legacy`, and `--confirm-quarantine`.

The implementation task must also require a current source checksum match, verified pre-cutover backup, empty/explicitly expected target-state gate, blockers equal to zero, dropped records equal to zero, explicit quarantine approval, transactional writes, post-import count/constraint verification, and tested rollback instructions. These requirements are sufficiently defined to implement under a separate reviewed change; apply remains unavailable now.

STOP before apply on backup or restore failure, checksum mismatch, pending migrations, unexpected target state, DB health failure, any active blocker or dropped record, failed auth/authorization/IDOR acceptance, or failed real-browser smoke.

## Cutover sequence (only after apply is implemented and approved)

1. Reconfirm the source snapshot hash and maintenance window.
2. Execute the approved import in one transaction or reviewed bounded batches.
3. Validate source, active, archive, membership, memory, quiz, answer, and XP counts.
4. Validate foreign keys, uniqueness, transaction rollback, and application queries.
5. Set `STORAGE_MODE=postgres`, then `AUTH_MODE=production`; restart gracefully.
6. Check `/api/status`, login/session/claim, authorization/IDOR, smoke, and real-browser acceptance.
7. Observe request/error rates, provider failures, pool health, and logs before reopening writes.

## Rollback criteria and steps

Rollback on any count mismatch, dropped record, active blocker, authentication/authorization regression, health failure, unbounded error rate, or restore failure.

1. Keep writes frozen and remove the new service from traffic.
2. Revert application configuration to the last approved mode; do not point production code at a test database.
3. If database writes must be reversed, restore the verified pre-cutover backup into a new isolated database and validate it before repointing. Do not overwrite the only production copy in place.
4. Preserve failed-import evidence, logs, source checksums, and quarantine data for review.
5. Re-run smoke and browser acceptance before restoring traffic.

## Operations, observability, and privacy

Use structured application logs and `/api/status` for minimum readiness monitoring. Keep metrics internal; no public detailed metrics endpoint is provided. Alert on health 503, auth failures, authorization denials, storage errors, provider failures, pool exhaustion, and shutdown timeouts. Logs must not contain credentials, session/claim tokens, raw research queries, memory text, or database URLs.

Before a real school deployment, complete non-code approval for KVKK/privacy notice, lawful basis and school authorization, retention periods, deletion/export workflows, operator access controls, incident response, and processor/subprocessor records.

See `STAGING_DEPLOYMENT.md` for the reverse-proxy, HTTPS, rate-limit, staging rehearsal, supervision, DNS, and backup-retention contract; use `GO_LIVE_CHECKLIST.md` as the final operational gate.
