# Inboxi — Production Deployment Runbook (no Docker)

**Target:** DigitalOcean droplet `67.205.130.18`, Ubuntu 22.04/24.04.
**Domain:** `inboxi.online` · **mail host:** `mail.inboxi.online`.
All services run natively: **PM2** (Node) + **systemd** (Haraka/rspamd) + **nginx** + **certbot**.

---

## ⚠️ Pre-flight (do these BEFORE anything else)

1. **Reverse DNS (PTR).** Rename the droplet to `mail.inboxi.online` in the DO panel so the PTR for `67.205.130.18` resolves to it. Verify:
   ```bash
   dig -x 67.205.130.18 +short        # → mail.inboxi.online.
   ```
2. **Outbound port 25.** DO blocks it by default. **Inbound 25 (receiving) works regardless.** For sending:
   - Start with the **external SMTP relay** driver (default). No port 25 needed.
   - To enable the **self-host** send driver later: open a DO ticket to unblock port 25, *and* fix IP reputation.
3. **IP reputation.** `67.205.130.18` is currently **listed on Spamhaus zen** (normal for a fresh DO IP). Request delisting at spamhaus.org and warm the IP before self-sending. Until clean, send via a reputable relay.

---

## DNS records (Cloudflare — Scenario A)

For `inboxi.online` (the admin "Provision DNS" button automates this once `CLOUDFLARE_API_TOKEN` is set; otherwise add manually):

| Type | Name | Value | Notes |
|------|------|-------|-------|
| A   | `mail` | `67.205.130.18` | mail host |
| A   | `@` | `67.205.130.18` | web |
| MX  | `@` | `mail.inboxi.online` (prio 10) | receiving |
| TXT | `@` | `v=spf1 a mx ip4:67.205.130.18 ~all` | SPF |
| TXT | `inboxi._domainkey` | `v=DKIM1; k=rsa; p=<public key>` | DKIM (generated per domain) |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@inboxi.online` | DMARC |

Verify anytime from **Admin → Domains → [domain] → Re-check DNS**.

---

## 1. System packages

```bash
# Node 22 (nodesource), then:
sudo apt-get update
sudo apt-get install -y postgresql redis-server nginx certbot python3-certbot-nginx rspamd git
sudo npm i -g pnpm pm2
sudo adduser --system --group inboxi
```

## 2. Database

```bash
sudo -u postgres psql -c "CREATE ROLE inboxi LOGIN PASSWORD 'STRONG_DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE inboxi OWNER inboxi;"
```

## 3. Code + secrets

```bash
sudo mkdir -p /opt/inboxi && sudo chown inboxi:inboxi /opt/inboxi
# clone or rsync the repo into /opt/inboxi, then:
cd /opt/inboxi
cp infra/.env.production.example .env
bash infra/gen-secrets.sh        # paste output into .env; set DATABASE_URL password
nano .env                        # fill in the rest
```

## 4. First deploy

```bash
cd /opt/inboxi
pnpm install --frozen-lockfile
pnpm --filter @inboxi/db generate
pnpm --filter @inboxi/db migrate:deploy
pnpm --filter @inboxi/db seed     # roles, plans, platform domain, admin user
pnpm build
```

> The seed creates an admin: `admin@inboxi.online` / `admin12345` — **change this password immediately** after first login.

## 5. Process managers

```bash
# Node apps (web + worker) under PM2
pm2 start infra/ecosystem.config.cjs
pm2 save && pm2 startup        # follow the printed command

# Mail services under systemd
sudo cp infra/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now haraka-inbound haraka-outbound rspamd
```

## 6. Web + TLS (nginx + Let's Encrypt)

```bash
sudo cp infra/nginx/inboxi.conf /etc/nginx/sites-available/inboxi
sudo ln -sf /etc/nginx/sites-available/inboxi /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
# Set the Cloudflare records to "DNS only" (grey cloud) first so Let's Encrypt
# reaches the origin directly. Then issue the cert (certbot injects the 443 block):
sudo certbot --nginx -d inboxi.online      # add  -d www.inboxi.online  only if a www DNS record exists
```

> The nginx config is **HTTP-only** on purpose — certbot adds the TLS/443 block.
> Never hardcode `ssl_certificate` paths before the cert exists, or `nginx -t`
> fails and the site never comes up (Cloudflare shows **521**).
> **Keep `mail` as DNS-only (grey) always** — SMTP cannot be proxied by Cloudflare.

## 7. Verify (go-live)

```bash
curl -fsS https://inboxi.online/api/health     # → {"status":"ok","db":true}
dig MX inboxi.online +short                    # → mail.inboxi.online
```

- Send a test mail from Gmail to `anything@inboxi.online` → appears in the inbox within seconds (`journalctl -u haraka-inbound -f`).
- Visit `https://inboxi.online` → instant temp address + live inbox.
- Outbound: send from the app → check inbox arrival + **mail-tester.com** (target ≥ 9/10), SPF/DKIM/DMARC pass.

---

## Subsequent releases

```bash
cd /opt/inboxi && bash infra/deploy.sh
```

This pulls, installs, runs migrations, builds, reloads PM2, restarts mail services, and runs the health check.

## Operations

- Logs: `pm2 logs inboxi-web` · `journalctl -u haraka-inbound -f`
- Status: `pm2 status` · `systemctl status haraka-inbound`
- DB backup: `pg_dump -U inboxi inboxi | gzip > backup-$(date +%F).sql.gz` (cron daily)
- The background worker (`inboxi-worker`) runs cleanup-anon (15 min) + enforce-retention (hourly) via BullMQ/Redis.
