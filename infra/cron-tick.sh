#!/usr/bin/env bash
# Fire one scheduled endpoint. Called by infra/cron.d/inboxi.
#
#   bash infra/cron-tick.sh scheduled-sends
#
# Two things this does that a bare crontab line does not:
#   1. Reads the shared secret from the app's own .env at call time instead of
#      duplicating it into the crontab, so rotating MAIL_INGEST_SECRET in one
#      place keeps every schedule working.
#   2. Passes it to curl over stdin (--config -), so it never appears in the
#      process list where any user on the box could read it.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/inboxi}"
PORT="${PORT:-3000}"
ENDPOINT="${1:?usage: cron-tick.sh <endpoint>}"

SECRET="$(sed -n 's/^MAIL_INGEST_SECRET=//p' "$APP_DIR/.env" | head -1 | tr -d '"'\''')"
if [ -z "$SECRET" ]; then
  echo "cron-tick: MAIL_INGEST_SECRET missing from $APP_DIR/.env" >&2
  exit 1
fi

curl --config - <<CURLRC
url = "http://127.0.0.1:${PORT}/api/cron/${ENDPOINT}"
get
data-urlencode = "secret=${SECRET}"
silent
show-error
fail
max-time = 120
CURLRC
