#!/bin/bash
# Arranque SysDash (Gunicorn 127.0.0.1:8001)
set -euo pipefail
BASE="$(cd "$(dirname "$0")" && pwd)"
set -a
# shellcheck source=/dev/null
source "$BASE/sysdash.env"
set +a
cd "$BASE/backend"
# 0.0.0.0 permite acceso desde la LAN y desde Nginx/Cloudflare Tunnel hacia esta IP.
exec "$BASE/venv/bin/gunicorn" --workers 2 --bind 0.0.0.0:8001 app:app
