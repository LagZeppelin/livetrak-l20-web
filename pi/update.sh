#!/usr/bin/env bash
# Fetches the newest version from GitHub and rebuilds; does nothing without internet or without changes.
# --no-restart: only build (used by install.sh).
set -euo pipefail
# the braces make bash read the whole script first, because git reset may replace this very file
{
cd "$(dirname "$0")/.."

git fetch -q origin main || { echo "Kein Internet, kein Update."; exit 0; }
if [ -f dist-server/main.js ] && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  exit 0
fi
git reset -q --hard origin/main
npm ci --no-audit --no-fund
npm run build
[ "${1:-}" = "--no-restart" ] || sudo systemctl restart l20-hub
echo "Aktualisiert auf $(git log -1 --format='%h %s')"
exit 0
}
