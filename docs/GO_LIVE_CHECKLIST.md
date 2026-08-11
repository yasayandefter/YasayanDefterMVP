# Yaşayan Defter go-live checklist

Unchecked items are STOP conditions; this checklist does not itself authorize cutover.

## Infrastructure

- [ ] Release commit and immutable pilot tag recorded
- [ ] Persistent Node service and supervisor reviewed
- [ ] Node port private; reverse proxy is the only ingress
- [ ] HTTPS certificate, redirect, renewal, canonical host, and DNS TTL verified
- [ ] Exact HTTPS `APP_ORIGIN` configured
- [ ] Health monitoring, disk/RSS/restart alerts, and log retention active

## Database

- [ ] Approved production DB and role identity verified without printing credentials
- [ ] Migrations 001–006 applied; no pending migration
- [ ] Constraints, archive tables, transaction rollback, and pool bounds verified
- [ ] Source checksum matches approved snapshot
- [ ] Active blockers = 0 and dropped records = 0

## Security

- [ ] Proxy rate limits active for login, claim, research, and quiz mutations
- [ ] Direct Node exposure blocked and forwarded-header ownership reviewed
- [ ] Origin/CSRF, secure cookie, IDOR, cross-school, mass-assignment, and role-spoofing tests pass
- [ ] Sensitive paths are not public; logs/errors contain no secrets or raw DB details
- [ ] Body/query limits and security headers pass

## Auth and browser

- [ ] Teacher login/session restore/logout passes
- [ ] Student login/research/quiz/progress/restore/logout passes
- [ ] Claim/session/reuse error passes
- [ ] Authorization and critical IDOR HTTP tests pass
- [ ] Edge browser, responsive layouts, accessibility, console/page/network checks pass

## Backup and observability

- [ ] Pre-deploy and pre-migration custom-format backups complete
- [ ] Backup checksums/manifests stored separately
- [ ] Disposable restore drill and representative counts pass
- [ ] Encrypted off-host copy and retention policy approved
- [ ] Health, logs, DB pool, provider, backup, disk, RSS, and restart dashboards/checks assigned

## Privacy

- [ ] KVKK/privacy notice and lawful basis approved
- [ ] School agreement and processor/operator responsibilities signed
- [ ] Retention, deletion/export, incident response, and backup access procedures assigned
- [ ] Audit owner and privileged operator list approved

## Cutover

- [ ] Maintenance/write-freeze window active
- [ ] Apply implementation has separate code review and authorization
- [ ] `--apply`, snapshot hash, confirmations, expected-state gate, transaction, and post-import verification approved
- [ ] Storage/auth switch, status, smoke, browser acceptance, and observation window staffed

## Rollback

- [ ] Rollback owner and decision threshold named
- [ ] Last approved JSON source remains immutable and recoverable
- [ ] Verified PostgreSQL restore target and configuration rollback steps rehearsed
- [ ] Session invalidation/user communication impact understood
- [ ] Traffic reopening requires repeated health, auth, authorization, and browser smoke
