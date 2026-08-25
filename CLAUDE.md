# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                 # Node >= 22, pnpm >= 10 (pinned: pnpm@10.6.2)
pnpm dev                     # turbo dev — web on :3000, worker needs REDIS_URL
pnpm build                   # turbo build
pnpm typecheck               # tsc --noEmit across the workspace — the real CI gate
pnpm test                    # vitest in @inboxi/shared, @inboxi/integrations, @inboxi/mta-inbound
pnpm format                  # prettier --write
```

Per-package (turbo filters):

```bash
pnpm --filter @inboxi/web dev
pnpm --filter @inboxi/shared exec vitest run src/__tests__/otp.test.ts   # one test file
pnpm --filter @inboxi/shared exec vitest run -t "extractOtp"             # one test by name
```

Database (Prisma; every script loads the **root** `.env` via `dotenv -e ../../.env`):

```bash
pnpm db:generate                      # prisma generate
pnpm db:migrate                       # prisma migrate dev
pnpm db:studio
pnpm --filter @inboxi/db seed         # permissions, roles, plans, platform domain, admin user
pnpm --filter @inboxi/db migrate:deploy   # production
```

Deploy (git-based; never copy files to the server):

```bash
pnpm deploy:server           # dev machine: refuses a dirty tree, pushes, runs infra/deploy.sh over SSH, health-checks
bash infra/deploy.sh         # on the server, from /opt/inboxi
```

`pnpm lint` maps to `next lint` in `apps/web`, but **no ESLint config or dependency is committed** — it is not a working gate. Use `pnpm typecheck` plus `pnpm test`.

## Environment

Two gitignored env files exist locally and **must be kept in sync**:

- `.env` (repo root) — read by turbo (`globalDependencies`), all Prisma scripts, and `infra/ecosystem.config.cjs` (PM2 injects it into every app in production).
- `apps/web/.env.local` — what `next dev` actually reads. Editing `DATABASE_URL` in only one file makes migrations and the running app talk to different databases. Local dev DB is `inboxi02`.

There are **two** committed templates and they disagree: `infra/.env.example` (dev) omits `HARAKA_HOST_LIST_PATH`, `MAIL_INGEST_SECRET` and `MAIL_INGEST_URL`, which `infra/.env.production.example` documents. Servers are built from the production one (`infra/SETUP.md` step 3); neither documents `APP_URL`, which `lib/payments.ts` and `lib/mail-connection.ts` read. **`.env` holds secrets and infrastructure only** — every behavioral setting belongs in the DB `Setting` store (see below).

Secrets that gate production: `AUTH_SECRET`, `ENCRYPTION_KEY`, `MAIL_INGEST_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`. `apps/web/src/lib/env.ts` knows the dev-default values of the three secrets; `/api/health` returns 503 if any are still in place in production, which makes the final health check in `infra/deploy.sh` fail the release.

## Architecture

Turborepo + pnpm workspaces. `apps/web` (Next.js 15 App Router, React 19), `apps/worker` (BullMQ), `apps/mta-inbound` + `apps/mta-outbound` (Haraka, Linux-only), `packages/db` (Prisma), `packages/shared`, `packages/integrations`, `infra/` (PM2, systemd, nginx, cron, deploy scripts). The README also lists `packages/ui` — it does not exist yet.

Workspace packages are consumed as **raw TypeScript source** (`main: ./src/index.ts`, no build step); `next.config.mjs` lists them in `transpilePackages`.

### Inbound mail

```
internet :25 -> Haraka (rcpt accepted via config/host_list)
             -> plugins/inboxi_ingest.js -> mailparser
             -> POST /api/mail/inbound  (header x-ingest-secret = MAIL_INGEST_SECRET)
             -> lib/ingest.ts ingestInbound()
```

`ingestInbound` resolves a recipient in a fixed order: **provisioned active mailbox → active anonymous session holding that temp address (applies the registration gate) → the domain's `CATCH_ALL` mailbox → reject**. Unknown or inactive domains are rejected. The MTA never touches the database; the web app owns persistence.

`host_list` is regenerated from active domains by `lib/haraka.ts syncHostList()`, which is a no-op unless `HARAKA_HOST_LIST_PATH` is set (so it only runs where the MTA is colocated). Any code path that activates or deactivates a domain must call it — see `createDomain` in `apps/web/src/app/admin/actions.ts`, which also calls `ensureCatchAllMailbox()` and `provisionDomainDns()`.

### Outbound mail

`lib/send.ts resolveTransports(domainId)` builds an ordered chain from `DomainDeliveryConfig` → `DeliveryTransport` rows, then `deliverWithFailover` (`@inboxi/integrations/delivery`) walks it. Three transport kinds: `SMTP_RELAY` (default in production — DigitalOcean blocks outbound 25), `SELF_HOST` (submits to the outbound Haraka on `127.0.0.1:587`), and `TEST_STREAM`, which is injected automatically outside production so the whole send path is exercisable with no relay configured. DKIM is signed by the web app before submission, never by the MTA.

### Configuration lives in the database

Behavioral settings go through `lib/settings.ts` `getSetting`/`setSetting`, typed by `SETTING_KEYS` + `SETTINGS_DEFAULTS` in `@inboxi/shared/settings`. Adding a setting means adding a key **and** a default there — never a literal at the call site. Same for RBAC: permission keys are duplicated on purpose in `packages/shared/src/permissions.ts` and `packages/db/prisma/seed.ts`, and both must be updated together.

`lib/alerts.ts sendOperatorAlert()` deliberately reads the owner's Telegram chat from the `Setting` store, **not** from `Integration` rows — `Integration.userId` is per-customer, and querying it once paged a customer with platform internals.

### Auth

- Users: JWT (jose, HS256, `AUTH_SECRET`) in the httpOnly `inboxi_session` cookie. `lib/session.ts` `getCurrentUser()` loads role permissions; `requireUser()` / `requireAdmin()` are the page guards, and admin is `roleName === 'admin'`.
- Anonymous visitors: `inboxi_anon` cookie → `AnonymousSession` with a generated temp address, a destruction timer, and a gate that locks messages after N of them (all three configurable via settings).
- API (`/api/v1/*`): keys shaped `inbx_<id>_<secret>`, stored as sha256, accepted as `Authorization: Bearer` or `X-API-Key` (`lib/apikey.ts`).
- Machine-to-machine: `MAIL_INGEST_SECRET` authenticates both the MTA ingest header and the `/api/cron/*` endpoints (`?secret=`).
- Secrets at rest (DKIM keys, SMTP passwords, OAuth tokens): AES-256-GCM via `lib/crypto.ts`, stored as `base64(iv).base64(tag).base64(ciphertext)`.

### Scheduled work

Two independent mechanisms:

1. `apps/worker` (BullMQ + Redis, PM2 process `inboxi-worker`) — `cleanup-anon` every 15 min, `enforce-retention` hourly. Job bodies in `src/jobs.ts` are plain async functions, callable directly in tests.
2. `infra/cron.d/inboxi` → `infra/cron-tick.sh` → `/api/cron/scheduled-sends` (every minute), `/api/cron/sending-health` (15 min), `/api/cron/deliverability` (hourly). `cron-tick.sh` reads the secret from `.env` at call time and passes it over stdin so it never appears in the process list.

Local dev runs neither: ingest performs its notification side-effects inline.

### Next.js patterns

Server actions live in `*-actions.ts` files colocated with their routes (`admin/actions.ts`, `admin/domain-actions.ts`, `dashboard/inbox-actions.ts`, …). A `'use server'` file may only export async functions — constants like `PLAN_FEATURES` are kept in `lib/plan-features.ts` for that reason. Every admin action starts with `await requireAdmin()`, and mutating ones call `writeAudit()` (best-effort, never throws) and `revalidatePath()`.

SEO metadata, homepage content, and CMS pages are DB-driven and rendered from the root layout (`lib/seo.ts`, `lib/home-content.ts`).

## Conventions

- Import Prisma types and enums from `@inboxi/db` (it re-exports `@prisma/client` plus the shared singleton), not from `@prisma/client` directly.
- Zod schemas for anything crossing a boundary go in `packages/shared/src/validation.ts`. Account identity uses `accountEmailSchema` (trim + lowercase before validation) on **both** signup and login; envelope addresses use `emailSchema` and keep their case.
- Pure decision logic that would otherwise only be reachable through a live session is extracted into `@inboxi/shared` as a testable function — e.g. `checkDomainDeletion` in `domain-policy.ts`.
- TypeScript is strict with `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`. Prettier: single quotes, 100 columns, trailing commas, semicolons.
- `.sh`, `.mjs`, `.cjs` are pinned to LF in `.gitattributes` — a CR makes the server abort with `$'\r': command not found`.
- Production runs natively (PM2 + systemd + nginx + certbot), no Docker. `infra/SETUP.md` is the runbook; `infra/DEPLOY_CHECKLIST.md` is the go-live list.
