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

  # The pull may have rewritten THIS script. bash reads a script incrementally
  # by byte offset, so continuing here would run a spliced mix of the old and
  # new file — which is how the cron-install step silently never ran once.
  # Hand over to the freshly pulled copy instead. INBOXI_DEPLOY_REEXEC stops
  # this from recursing when the new copy finds nothing left to pull.
  if [ "${INBOXI_DEPLOY_REEXEC:-0}" != "1" ]; then
    echo "  Re-running the updated deploy script…"
    INBOXI_DEPLOY_REEXEC=1 exec bash "$APP_DIR/infra/deploy.sh"
  fi
fi

echo "▶ Installing dependencies…"
pnpm install --frozen-lockfile

echo "▶ Generating Prisma client…"
pnpm --filter @inboxi/db generate

echo "▶ Applying database migrations…"
pnpm --filter @inboxi/db migrate:deploy

echo "▶ Scaffolding Haraka config…"
bash infra/setup-haraka.sh

echo "▶ Installing scheduled jobs…"
if [ -d /etc/cron.d ]; then
  # cron ignores files whose mode is group/world writable, or that are not 0644.
  install -m 0644 -o root -g root infra/cron.d/inboxi /etc/cron.d/inboxi
  chmod +x infra/cron-tick.sh
  # An older manual crontab would double-fire every job alongside /etc/cron.d.
  if crontab -l 2>/dev/null | grep -q '/api/cron/'; then
    echo "  ⚠️  root's personal crontab still calls /api/cron/ — it now duplicates"
    echo "     /etc/cron.d/inboxi. Remove those lines with: crontab -e"
  fi
else
  echo "  (no /etc/cron.d on this system — install the schedules manually)"
fi

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
