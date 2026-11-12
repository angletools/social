# Operating and recovering Rasd

Use the same release and environment for the web and worker. Keep the database private, serve the app over HTTPS, and set `APP_URL` to its actual public URL. Invitation and recovery links use that configured origin. The original demo workspace is permanently DEMO; create a separate LIVE workspace for real collection.

## Release and recovery

1. Stop web and worker. Record the release commit, database version and the previous release's migration count.
2. Take a custom-format PostgreSQL backup with `pg_dump --format=custom --no-owner --file=rasd-backup.dump`. Supply the connection through protected environment variables or a restricted PostgreSQL service file; do not commit credentials or dumps.
3. Restore the backup into a **separate** database with `createdb` and `pg_restore --no-owner --dbname=<restore_database> rasd-backup.dump`. Compare organization/user/post/report/draft counts, verify sign-in in an isolated app, and verify data-mode constraints. A successful dump alone does not prove recoverability.
4. Run `npx prisma migrate deploy`, then start the updated web and worker. Check `/api/health`, Settings → System, collection last-success times and Alerts/Reports delivery history.
5. If rollback is necessary, stop both processes and restore into a new database. Point the previous application release at that database after verification. Do not remove migration rows or reverse schema changes against a database that has accepted new writes. Recovery loses writes after the chosen backup; establish the team's recovery point and time objectives before launch.

All migrations are append-only. The stabilization migrations add AI usage/turn reservations, classification metadata, an overlap-query index, a minimum alert volume, and hashed access tokens. They label older enrichment as SAMPLE (DEMO) or LEGACY (live source unknown), without inventing model provenance. No existing reports are recalculated. The earlier approval migration requires renewed review of unproven legacy approvals.

## Failure handling

- Collection failures retain their last-success timestamp and retry through the queue. Do not start another paid run when a stored provider run can be resumed.
- AI calls reserve a conservative input/output allowance before contacting the provider. Actual reported input, output and cached-input usage replaces that reservation on success. Unknown outcomes keep their reservation for the calendar month; a stopped connection is not proof that a provider charged nothing. Adjust the workspace allowance only after checking provider usage. Automatic retries and fallback-model calls are disabled.
- Assistant turns expire after a bounded deadline. Stop and client disconnect abort the provider connection. Partial text is not stored as a completed answer. A crashed process leaves a conservative usage reservation and an expiring active-turn lease.
- Reprocessing selects a bounded oldest-first batch and persists it as pending. The minute scheduler resumes pending work after restarts. Human corrections and sample classifications are excluded. A leased classifier writes with revision checks so a correction made during a model request wins. Context snapshots are retained in the audit log under `classification.context` and linked by fingerprint.
- Alert/weekly deliveries retain attempts, next retry and errors. A successful provider acceptance is recorded as sent; it is not proof of receipt. SMTP is at-least-once: acceptance followed by a crash, or partial recipient acceptance, can duplicate a retry. Confirm recipient receipt during the pilot.
- Invitation links last 48 hours and can be used once. The admin shares the link; creating an invitation does not send email. Reinviting the same inactive email replaces its old link. Recovery links are sent through SMTP, last 30 minutes, and return a generic response whether the account exists or not. Deactivation and password changes revoke outstanding links; successful recovery revokes sessions. Pending invitations reserve seats.

## Retention

Nightly maintenance removes old login attempts, expired sessions/access tokens and eligible old notifications. AI usage, context snapshots, correction/review audit history, mentions, reports and draft versions remain until the workspace's explicit data-removal process removes them. Establish a retention policy before production; do not silently purge evidence or audit history with a release.

## Verification boundaries

`npm run test:integration` uses a disposable `rasd_test_*` database. The suite covers real transactions and sessions, local SMTP acceptance/rejection, local SDK streaming/cancellation, budgets, classification races, deduplication, historical reports, review handoff, and one-use account links. It does not contact paid providers.

`scripts/benchmark-local.ts` refuses non-local/non-test databases. It creates 100,000 captures representing 25,000 unique posts across four monitors, measures representative reads three times, then removes the fixture. This is a query benchmark, not a multi-user load or infrastructure capacity test.

Before a live pilot, run real Monid collection and resumption, a paid Anthropic round trip and cancellation, independent Arabic-quality evaluation, receipt of recovery/alert/report email, and backup restoration in the intended hosting environment. Run remote CI for the exact candidate commit. Local passing checks do not replace those gates.
