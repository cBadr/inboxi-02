#!/usr/bin/env bash
# One-time: turn the server's app directory into a git checkout tracking origin/main.
#
# Safe by design:
#   • never deletes or overwrites your working files
#   • .env, Haraka generated config, node_modules and data/ are gitignored → untouched
#   • if the directory already drifted from the repo, it REPORTS the drift and stops
#     so a human decides, instead of silently clobbering hand-edits.
#
#   cd /opt/inboxi && bash infra/bootstrap-git.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/inboxi}"
REMOTE="${REMOTE:-https://github.com/cBadr/inboxi-02.git}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "▶ Target: $APP_DIR  ←  $REMOTE ($BRANCH)"

if [ -d .git ]; then
  echo "▶ Already a git repo — making sure the remote is correct…"
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$REMOTE"
  else
    git remote add origin "$REMOTE"
  fi
else
  echo "▶ Not a git repo yet — initialising in place (no files are touched)…"
  git init -q
  git remote add origin "$REMOTE"
fi

echo "▶ Fetching…"
git fetch origin "$BRANCH" --quiet

# Point the branch at origin without touching the working tree.
git checkout -q -B "$BRANCH" 2>/dev/null || true
git reset --mixed "origin/$BRANCH" >/dev/null
git branch --set-upstream-to="origin/$BRANCH" "$BRANCH" >/dev/null 2>&1 || true

DRIFT="$(git status --porcelain --untracked-files=no)"
if [ -n "$DRIFT" ]; then
  cat <<'WARN'

⚠️  DRIFT DETECTED — files on this server differ from the repo.
    These are almost certainly hand-edits made during the pscp era.

WARN
  git status --short --untracked-files=no
  cat <<WARN

    Nothing has been changed. Choose one:

      A) Repo wins (discard the server's local edits):
           git checkout -f $BRANCH

      B) Keep a server edit? Copy it out first, then do (A), then re-apply
         it as a proper commit in the repo.

    Then run: bash infra/deploy.sh
WARN
  exit 2
fi

echo "▶ No drift — server matches the repo."
echo "✅ Bootstrap complete. Now at: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
echo "   From now on:  cd $APP_DIR && bash infra/deploy.sh"
