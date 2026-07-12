#!/usr/bin/env bash
# Integration smoke test — safe chats only (fail-closed if no safe group).
# Usage: ./scripts/integration-smoke-test.sh <userId>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_ID="${1:?user id required}"
CONTAINER="${WORKER_CONTAINER:-line-worker-line-1}"
WORKER="${WORKER_LINE_URL:-}"
STAMP="$(date +%s)"

if [ -f "$ROOT/.env" ]; then
  KEY="${INTERNAL_API_KEY:-$(grep -E '^INTERNAL_API_KEY=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r' || true)}"
fi
KEY="${KEY:-${INTERNAL_API_KEY:-}}"
if [ -z "$KEY" ]; then
  echo "INTERNAL_API_KEY required (set in .env or environment)" >&2
  exit 1
fi

USER_TOKEN="$(node -e "
const crypto = require('crypto');
const userId = process.argv[1];
const secret = process.argv[2];
const exp = Math.floor(Date.now() / 1000) + 120;
const payload = userId + ':' + exp;
const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
process.stdout.write(payload + '.' + sig);
" "$USER_ID" "$KEY")"

api_get() {
  if [ -n "$WORKER" ]; then
    if command -v curl >/dev/null 2>&1; then
      curl -sf -H "x-internal-key: $KEY" -H "x-worker-user-token: $USER_TOKEN" "$WORKER$1" 2>&1
    else
      wget -q -O - --header="x-internal-key: $KEY" --header="x-worker-user-token: $USER_TOKEN" "$WORKER$1" 2>&1
    fi
  else
    docker exec "$CONTAINER" wget -q -O - --header="x-internal-key: $KEY" --header="x-worker-user-token: $USER_TOKEN" "http://127.0.0.1:4000$1" 2>&1
  fi
}

api_post() {
  path="$1"
  data="${2:-\{\}}"
  if [ -n "$WORKER" ]; then
    if command -v curl >/dev/null 2>&1; then
      curl -sf -H "x-internal-key: $KEY" -H "x-worker-user-token: $USER_TOKEN" -H "Content-Type: application/json" -d "$data" "$WORKER$path" 2>&1
    else
      wget -q -O - \
        --header="x-internal-key: $KEY" \
        --header="x-worker-user-token: $USER_TOKEN" \
        --header="Content-Type: application/json" \
        --post-data="$data" \
        "$WORKER$path" 2>&1
    fi
  else
    docker exec "$CONTAINER" wget -q -O - \
      --header="x-internal-key: $KEY" \
      --header="x-worker-user-token: $USER_TOKEN" \
      --header="Content-Type: application/json" \
      --post-data="$data" \
      "http://127.0.0.1:4000$path" 2>&1
  fi
}

send_test() {
  label="$1"
  mid="$2"
  payload=$(node -e "console.log(JSON.stringify({chatMid:process.argv[1],text:process.argv[2]}))" "$mid" "[smoke-$STAMP] $label")
  result=$(api_post "/line/$USER_ID/send/text" "$payload" || true)
  if echo "$result" | grep -q '"ok"'; then
    echo "  PASS $label"
    return 0
  fi
  echo "  FAIL $label: $result"
  return 1
}

echo "=== Integration smoke test (safe chats only) ==="
echo "User: $USER_ID"
if [ -n "$WORKER" ]; then
  echo "Worker: $WORKER"
else
  echo "Worker: docker exec $CONTAINER → :4000"
fi

echo ""
echo "--- Health ---"
HEALTH=$(api_get "/health" || true)
echo "$HEALTH"
echo "$HEALTH" | grep -q '"status":"ok"' || {
  echo "ERROR: worker health check failed"
  exit 1
}

echo ""
echo "--- Sync ---"
api_post "/line/$USER_ID/sync" "{}" >/dev/null || true

# Accept GROUP_CHAT, SQUARE_CHAT, or CI aliases SMOKE_GROUP_MID / SMOKE_OPENCHAT_MID
GROUP_MID="${GROUP_CHAT:-${SMOKE_GROUP_MID:-}}"
OPENCHAT_MID="${SQUARE_CHAT:-${SMOKE_OPENCHAT_MID:-}}"

if [ -z "$GROUP_MID" ]; then
  echo ""
  echo "ABORT: Set GROUP_CHAT or SMOKE_GROUP_MID to a safe test group chatMid."
  exit 1
fi

FAIL=0

echo ""
echo "Safe group mid: $GROUP_MID"
send_test "group-e2ee" "$GROUP_MID" || FAIL=1

if [ -n "$OPENCHAT_MID" ]; then
  echo ""
  echo "Safe OpenChat mid: $OPENCHAT_MID"
  send_test "openchat" "$OPENCHAT_MID" || FAIL=1
else
  echo ""
  echo "SKIP openchat send (no safe square chat with Test in name)"
fi

echo ""
echo "--- Post-send health (bridge recovery) ---"
HEALTH2=$(api_get "/health" || true)
echo "$HEALTH2"
echo "$HEALTH2" | grep -q '"status":"ok"' || FAIL=1

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "SMOKE TEST FAILED"
  exit 1
fi

echo ""
echo "SMOKE TEST PASSED"
