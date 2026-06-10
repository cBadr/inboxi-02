#!/usr/bin/env bash
# Scaffold complete Haraka config for both MTAs. Haraka 3.2.x needs a FULL
# config directory (connection.ini, tls.ini, etc.); a hand-made minimal one
# crashes. So copy Haraka's own defaults, then apply Inboxi customizations.
# Idempotent — safe to re-run on every deploy. Run after `pnpm install`.
set -euo pipefail

ROOT="${APP_DIR:-/opt/inboxi}"
PKG=$(ls -d "$ROOT"/node_modules/.pnpm/Haraka@*/node_modules/Haraka 2>/dev/null | head -1)
if [ -z "${PKG:-}" ]; then
  echo "Haraka package not found under $ROOT/node_modules — run pnpm install first." >&2
  exit 1
fi
echo "Haraka package: $PKG"

scaffold() {
  local dir="$1" listen="$2"
  echo "▶ configuring $dir (listen=$listen)"
  mkdir -p "$dir/config"
  # Fill in all Haraka default config files (does not touch plugins/ or lib/).
  cp -rf "$PKG/config/." "$dir/config/"
  # listen address
  if grep -q '^;*[[:space:]]*listen=' "$dir/config/smtp.ini"; then
    sed -i "s/^;*[[:space:]]*listen=.*/listen=$listen/" "$dir/config/smtp.ini"
  else
    printf 'listen=%s\n' "$listen" >> "$dir/config/smtp.ini"
  fi
  printf 'mail.inboxi.online\n' > "$dir/config/me"
}

# ── Inbound: catch-all receive on :25, forward to the web ingest endpoint ──
scaffold "$ROOT/apps/mta-inbound" "0.0.0.0:25"
printf 'inboxi.online\n' > "$ROOT/apps/mta-inbound/config/host_list"
printf 'rcpt_to.in_host_list\ninboxi_ingest\n' > "$ROOT/apps/mta-inbound/config/plugins"

# ── Outbound: local submission on :587, relay to the internet ──
scaffold "$ROOT/apps/mta-outbound" "127.0.0.1:587"
printf 'relay\n' > "$ROOT/apps/mta-outbound/config/plugins"
printf '[relay]\nacl=true\n' > "$ROOT/apps/mta-outbound/config/relay.ini"
printf '127.0.0.1/32\n::1/128\n' > "$ROOT/apps/mta-outbound/config/relay_acl_allow"

echo "✅ Haraka config ready for both MTAs."
