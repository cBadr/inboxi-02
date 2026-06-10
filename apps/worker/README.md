# @inboxi/worker

BullMQ background worker for scheduled maintenance:

- **cleanup-anon** (every 15 min) — delete expired anonymous sessions + their messages
- **enforce-retention** (hourly) — delete mailbox messages older than the owner's plan retention window

Requires Redis (`REDIS_URL`). On the server it runs under PM2 (see
`infra/ecosystem.config.cjs`). Local dev does not run Redis, so the web app's
ingest performs its notification side-effects inline; the scheduled cleanup jobs
are exercised in production. The job functions in `src/jobs.ts` are plain async
functions and can be invoked directly for testing.
