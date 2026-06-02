#!/bin/sh
set -e

if [ ! -f /data/data.json ]; then
  echo "[Steward] Creating initial data.json..."
  cp /app/data.default.json /data/data.json
fi

echo "[Steward] Starting server on port 3000..."
exec node /app/server.js
