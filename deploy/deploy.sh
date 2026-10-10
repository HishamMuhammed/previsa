#!/usr/bin/env bash
# Deploy Previsa to this VPS.
#
#   ./deploy/deploy.sh
#
# Builds the static site, copies it to the directory the nginx container mounts,
# and recreates the container. Roughly ten seconds.
#
# The nginx container mounts /data/coolify/previsa read-only, so it cannot see
# the build directory — hence the copy. Everything is owned by UID 9999 (the
# `nobody` user the nginx:alpine image runs as) because the container mounts the
# directory read-only and cannot chown it from the inside.
#
# Routing and TLS are handled by Coolify's Traefik via labels in
# docker-compose.yml, so no web-server config changes are needed here.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$DIR/deploy"
SERVE_DIR=/data/coolify/previsa
COMPOSE_SERVICE=previsa

cd "$DIR"

echo "==> Building"
node ./node_modules/vite/bin/vite.js build

echo "==> Staging to $SERVE_DIR"
sudo -n mkdir -p "$SERVE_DIR"
# A clean rsync rather than a plain copy: Vite emits hashed filenames, so an old
# bundle left behind is dead weight, and a stale index.html would be served with
# no-cache and immediately be wrong.
sudo -n rsync -a --delete "$DIR/dist/" "$SERVE_DIR/"
sudo -n chown -R 9999:9999 "$SERVE_DIR"

echo "==> Restarting the container"
cd "$DEPLOY"
sudo -n docker compose up -d --force-recreate

echo "==> Verifying"
for i in $(seq 1 12); do
  code=$(curl -sS --max-time 10 -o /dev/null -w "%{http_code}" \
    https://previsa.hardest.qzz.io/ 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then
    echo "    live: https://previsa.hardest.qzz.io/"
    exit 0
  fi
  sleep 2
done

echo "    ERROR: site did not return 200 (last: $code)"
exit 1