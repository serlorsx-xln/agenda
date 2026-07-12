#!/bin/sh
set -eu

# Named volumes may be owned by root from older images; always fix before drop.
mkdir -p /data/session
chown -R node:node /data

echo "[entrypoint] starting worker-line..."
exec su-exec node:node pnpm --filter @line/worker-line start
