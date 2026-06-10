#!/usr/bin/env bash
# Generate strong production secrets. Paste the output into /opt/inboxi/.env.
set -euo pipefail

echo "# Generated secrets — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "AUTH_SECRET=\"$(openssl rand -hex 32)\""
echo "ENCRYPTION_KEY=\"$(openssl rand -hex 32)\""
echo "MAIL_INGEST_SECRET=\"$(openssl rand -hex 24)\""
echo
echo "# Also set a strong Postgres password and put it in DATABASE_URL:"
echo "#   DB_PASSWORD=$(openssl rand -hex 16)"
