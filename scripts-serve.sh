#!/usr/bin/env bash
# Serves the built app and publishes it through a Cloudflare Quick Tunnel.
# Same supervision policy as the vanilla app: restart whichever half dies, and
# rewrite tunnel-url.txt whenever the hostname changes (Quick Tunnels are
# single-use by name, so a restart always means a new URL).
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PREVISA_REACT_PORT:-4173}"
BIN="${CLOUDFLARED_BIN:-/tmp/cloudflared}"
URLFILE="$DIR/tunnel-url.txt"
LOG="$DIR/tunnel.log"

[ -x "$BIN" ] || { echo "cloudflared not found at $BIN"; exit 1; }
pkill -f "vite.*preview" 2>/dev/null
pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" 2>/dev/null
sleep 1

nohup node "$DIR/node_modules/vite/bin/vite.js" preview --port "$PORT" --host 127.0.0.1 > "$DIR/origin.log" 2>&1 &
for i in $(seq 1 30); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 0.5
done
echo "origin ready on $PORT"

touch "$LOG"
OFFSET=$(wc -c < "$LOG" 2>/dev/null || echo 0)
nohup "$BIN" tunnel --url "http://127.0.0.1:$PORT" --protocol http2 >> "$LOG" 2>&1 &
for i in $(seq 1 60); do
  URL=$(tail -c "+$((OFFSET+1))" "$LOG" 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)
  [ -n "$URL" ] && { echo "$URL" > "$URLFILE"; echo "public: $URL"; break; }
  sleep 1
done
