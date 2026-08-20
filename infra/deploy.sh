#!/usr/bin/env bash
# Inboxi deploy script. Run on the server from the repo root (/opt/inboxi).
# Idempotent: safe to re-run for every release.
#
#   cd /opt/inboxi && bash infra/deploy.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/inboxi}"
cd "$APP_DIR"

echo "▶ Pulling latest code…"
if [ ! -d .git ]; then
  echo "❌ $APP_DIR is not a git checkout — nothing would be pulled and this"
  echo "   deploy would silently rebuild the OLD code."
  echo "   Run once:  bash infra/bootstrap-git.sh"
  exit 1
fi

BEFORE="$(git rev-parse --short HEAD)"
git pull --ff-only
AFTER="$(git rev-parse --short HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  echo "  Already up to date at $AFTER."
else
  echo "  $BEFORE → $AFTER"
  git --no-pager log --oneline "$BEFORE..$AFTER" | sed 's/^/    /'
fi

echo "▶ Installing dependencies…"
pnpm install --frozen-lockfile

echo "▶ Generating Prisma client…"
pnpm --filter @inboxi/db generate

echo "▶ Applying database migrations…"
pnpm --filter @inboxi/db migrate:deploy

echo "▶ Scaffolding Haraka config…"
bash infra/setup-haraka.sh

echo "▶ Building…"
pnpm build

echo "▶ Reloading Node services (PM2)…"
if pm2 describe inboxi-web > /dev/null 2>&1; then
  pm2 reload infra/ecosystem.config.cjs --update-env
else
  pm2 start infra/ecosystem.config.cjs
  pm2 save
fi

echo "▶ Restarting mail services (systemd)…"
sudo systemctl restart haraka-inbound haraka-outbound rspamd 2>/dev/null || \
  echo "  (systemd units not installed yet — see infra/SETUP.md)"

echo "▶ Health check…"
sleep 3
if curl -fsS http://127.0.0.1:3000/api/health; then
  echo
  echo "✅ Deploy complete — now running $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
else
  echo
  echo "⚠️  Health check failed — inspect: pm2 logs inboxi-web"
  exit 1
fi
