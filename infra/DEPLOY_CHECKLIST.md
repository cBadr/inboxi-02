# Inboxi — Go-Live Checklist

## Pre-flight (infrastructure)
- [ ] PTR for `67.205.130.18` → `mail.inboxi.online` (`dig -x 67.205.130.18`)
- [ ] Decide outbound: **external SMTP relay** (recommended now) vs self-host (needs port 25 + clean IP)
- [ ] Spamhaus delisting requested for the sending IP (if self-sending)
- [ ] DNS: A (mail, @), MX, SPF, DKIM, DMARC published in Cloudflare

## Server prep
- [ ] Packages installed (postgres, redis, nginx, certbot, rspamd, pnpm, pm2)
- [ ] `inboxi` system user created
- [ ] Postgres role + database `inboxi` created with a strong password

## App config
- [ ] `/opt/inboxi/.env` created from `.env.production.example`
- [ ] Secrets generated (`gen-secrets.sh`) — AUTH_SECRET, ENCRYPTION_KEY, MAIL_INGEST_SECRET
- [ ] No dev-default secrets remain (health endpoint reports none)
- [ ] `NEXT_PUBLIC_SITE_URL=https://inboxi.online`
- [ ] Cloudflare API token set (for DNS automation)
- [ ] SMTP relay creds OR Telegram/crypto keys set as needed

## First deploy
- [ ] `pnpm install --frozen-lockfile` clean
- [ ] `migrate:deploy` applied
- [ ] `seed` run; **admin password changed from default**
- [ ] `pnpm build` succeeds
- [ ] PM2 apps online (`inboxi-web`, `inboxi-worker`); `pm2 save` + startup
- [ ] systemd units enabled (haraka-inbound, haraka-outbound, rspamd)
- [ ] nginx site + TLS cert issued; HTTPS redirect works

## Verification
- [ ] `https://inboxi.online/api/health` → `{"status":"ok"}`
- [ ] Homepage issues an instant temp address; live inbox polls
- [ ] External mail → `anything@inboxi.online` lands in seconds
- [ ] Registration unlocks gated messages
- [ ] Outbound send arrives; mail-tester ≥ 9/10; SPF/DKIM/DMARC pass
- [ ] Admin: domain Re-check DNS = VERIFIED; reputation scan runs
- [ ] Crypto IPN webhook reachable from provider (CoinPayments/BinancePay dashboard)

## Post-launch
- [ ] Daily `pg_dump` backup cron + offsite copy
- [ ] Uptime monitor on `/api/health`
- [ ] Log rotation for PM2 + Haraka
- [ ] Abuse contact + ToS pages published (CMS)
