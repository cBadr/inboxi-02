#!/usr/bin/env bash
# Deploy from your machine in one command: push, then pull+build on the server.
#
#   bash infra/remote-deploy.sh
#
# Requires key-based SSH to the server (see infra/SETUP.md → "Deploy key").
set -euo pipefail

SERVER="${SERVER:-root@67.205.130.18}"
APP_DIR="${APP_DIR:-/opt/inboxi}"
BRANCH="${BRANCH:-main}"

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree is dirty — commit or stash first:"
  git status --short
  exit 1
fi

echo "▶ Pushing $BRANCH to origin…"
git push origin "$BRANCH"

echo "▶ Deploying on $SERVER…"
ssh -o ConnectTimeout=15 "$SERVER" "cd '$APP_DIR' && bash infra/deploy.sh"

echo "▶ Public health check…"
curl -fsS https://inboxi.online/api/health && echo && echo "✅ Live."
