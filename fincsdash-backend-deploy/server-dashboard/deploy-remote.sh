#!/bin/bash
set -eu
HOME_DIR="$HOME"
SD="$HOME_DIR/server-dashboard"
TMP="$HOME_DIR/server-dashboard-tmp"

if [ ! -d "$TMP" ]; then
  echo "Missing $TMP"
  exit 1
fi

if [ -d "$SD" ]; then
  rm -rf "$SD.bak" 2>/dev/null || true
  mv "$SD" "$SD.bak"
fi
mv "$TMP" "$SD"
cd "$SD"
chmod +x run-sysdash.sh

python3 -m venv venv
./venv/bin/pip install -q --upgrade pip
./venv/bin/pip install -q -r backend/requirements.txt

TOKEN=$(openssl rand -hex 24)
printf 'DASHBOARD_TOKEN=%s\n' "$TOKEN" > sysdash.env
chmod 600 sysdash.env
echo "$TOKEN" > .token_readable_once.txt
chmod 600 .token_readable_once.txt

fuser -k 8001/tcp 2>/dev/null || true
sleep 1
nohup ./run-sysdash.sh >> gunicorn-sysdash.log 2>&1 &
echo $! > gunicorn-sysdash.pid
sleep 2

if ss -tlnp 2>/dev/null | grep -q ':8001'; then
  echo "LISTEN_OK"
else
  echo "LISTEN_FAIL"
  tail -40 gunicorn-sysdash.log || true
  exit 1
fi

CRON_LINE='@reboot sleep 25 && /home/cristians/server-dashboard/run-sysdash.sh >> /home/cristians/server-dashboard/gunicorn-sysdash.log 2>&1'
( crontab -l 2>/dev/null | grep -v 'server-dashboard/run-sysdash.sh' || true; echo "$CRON_LINE" ) | crontab -

echo "DEPLOY_OK"
echo "TOKEN (guarda en lugar seguro; también en .token_readable_once.txt):"
cat .token_readable_once.txt
