#!/usr/bin/env bash
# Run session capacity benchmark in a one-off worker container (no duplicate LINE sessions).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LOADTEST_MACHINE_RAM_GB="${LOADTEST_MACHINE_RAM_GB:-8}"
export LOADTEST_RESERVED_RAM_GB="${LOADTEST_RESERVED_RAM_GB:-2.5}"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.loadtest.yml"

echo "=== Rebuild worker-line (includes benchmark script) ==="
$COMPOSE build worker-line

echo ""
echo "=== Start postgres + migrate ==="
$COMPOSE up -d postgres
$COMPOSE run --rm migrate

echo ""
echo "=== Stop long-running worker (avoid duplicate LINE session) ==="
$COMPOSE stop worker-line 2>/dev/null || true

echo ""
echo "=== Run benchmark (one-off container) ==="
$COMPOSE run --rm --no-deps worker-line \
  sh -c 'NODE_OPTIONS="--expose-gc" pnpm --filter @line/worker-line loadtest:sessions'

echo ""
echo "=== Copy report to host ==="
VOL="$(docker volume ls -q --filter name=worker_session | head -1)"
if [ -n "$VOL" ]; then
  docker run --rm -v "$VOL:/data/session:ro" -v "$ROOT:/out" alpine \
    sh -c 'cp /data/session/loadtest-report.json /out/loadtest-report.json 2>/dev/null || echo no-report'
fi

if [ -f "$ROOT/loadtest-report.json" ]; then
  echo "Report: $ROOT/loadtest-report.json"
  python3 - <<'PY' "$ROOT/loadtest-report.json"
import json, sys
r = json.load(open(sys.argv[1]))
c = r["capacityEstimate"]
print("\n--- Summary ---")
print(f"Per session idle: {c['perSessionIdleRssMb']} MB RSS")
print(f"Max connect idle ({r['assumptions']['machineRamGb']}GB machine): ~{c['idleConnect']['conservative']} sessions")
print(f"Max connect + auto-reply: ~{c['connectWithAutoReply']['conservative']} sessions")
real = r.get("realRestore", {})
if real.get("count"):
    print(f"Real restore measured: {real['count']} session(s), +{real['delta']['rssMb']} MB RSS")
PY
else
  echo "Report not found on volume"
fi

echo ""
echo "=== Restart worker ==="
$COMPOSE up -d worker-line
