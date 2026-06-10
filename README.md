# Inboxi

SaaS temporary-email + domains platform. Free disposable inboxes with a registration gate, paid subscription tiers, a full self-hosted mail core (catch-all receive + pluggable send), automated Cloudflare DNS, and admin modules (CMS, SEO, Ads, live analytics).

## Stack

- **Monorepo:** Turborepo + pnpm + TypeScript
- **Web:** Next.js (App Router)
- **Data:** PostgreSQL + Prisma, Redis + BullMQ
- **Mail:** Haraka (inbound MX, catch-all) + pluggable outbound (`DeliveryTransport`: self-host SMTP / external relay)
- **Realtime:** Socket.IO
- **Payments:** crypto only — CoinPayments + BinancePay
- **DNS:** Cloudflare API
- **Runtime (server):** native, **no Docker** — PM2 + systemd + nginx + certbot

## Layout

```
apps/
  web/          Next.js — marketing + user dashboard + admin + SSR (SEO/CMS)
  mta-inbound/  Haraka inbound SMTP (catch-all)
  mta-outbound/ Outbound delivery service
  worker/       BullMQ workers (parsing, notifications, analytics, DNS, reputation)
packages/
  db/           Prisma schema + client
  shared/       types, zod schemas, RBAC, utils, template engine
  integrations/ Cloudflare, Google, Telegram, payments
  ui/           shared React components + page-builder blocks
infra/          PM2 / systemd / nginx / setup scripts
```

## Getting started (dev)

```bash
pnpm install
cp infra/.env.example .env        # fill in values
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## Infrastructure

- Server: DigitalOcean droplet `67.205.130.18`
- Domain: `inboxi.online` · mail host: `mail.inboxi.online`
- Set PTR (reverse DNS) for the IP to `mail.inboxi.online`.
- DigitalOcean blocks outbound port 25 by default — outbound defaults to an external SMTP relay; the self-host driver is enabled per-domain once port 25 is available and the IP is warmed.

See `infra/SETUP.md` and the architecture plan for details.
