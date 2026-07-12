#!/usr/bin/env bash
# Full integration test — safe chats only (name contains "Test"; group memberCount=2).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_ID="${USER_ID:-sADT1reB2MprMkzOYJXV2cpjlqnjsHJP}"
CONTAINER="${WORKER_CONTAINER:-line-worker-line-1}"
KEYWORD="${KEYWORD:-AgendaTest_$(date +%s)}"

if [ -f "$ROOT/.env" ]; then
  KEY="${INTERNAL_API_KEY:-$(grep -E '^INTERNAL_API_KEY=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r' || true)}"
fi
KEY="${KEY:-${INTERNAL_API_KEY:-}}"
if [ -z "$KEY" ]; then
  echo "INTERNAL_API_KEY required (set in .env or environment)" >&2
  exit 1
fi

pass=0
fail=0
skip=0

worker_user_token() {
  node -e "
const crypto = require('crypto');
const userId = process.argv[1];
const secret = process.argv[2];
const exp = Math.floor(Date.now() / 1000) + 120;
const payload = userId + ':' + exp;
const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
process.stdout.write(payload + '.' + sig);
" "$USER_ID" "$KEY"
}

api() {
  local method="$1" path="$2" data="${3:-}"
  local token=""
  if [ "$path" != "/health" ]; then
    token="$(worker_user_token)"
  fi
  if [ -n "$data" ]; then
    if [ -n "$token" ]; then
      docker exec "$CONTAINER" wget -q -O - \
        --header="x-internal-key: $KEY" \
        --header="x-worker-user-token: $token" \
        --header="Content-Type: application/json" \
        --post-data="$data" \
        "http://127.0.0.1:4000$path" 2>&1
    else
      docker exec "$CONTAINER" wget -q -O - \
        --header="x-internal-key: $KEY" \
        --header="Content-Type: application/json" \
        --post-data="$data" \
        "http://127.0.0.1:4000$path" 2>&1
    fi
  else
    if [ -n "$token" ]; then
      docker exec "$CONTAINER" wget -q -O - \
        --header="x-internal-key: $KEY" \
        --header="x-worker-user-token: $token" \
        "http://127.0.0.1:4000$path" 2>&1
    else
      docker exec "$CONTAINER" wget -q -O - \
        --header="x-internal-key: $KEY" \
        "http://127.0.0.1:4000$path" 2>&1
    fi
  fi
}

check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  PASS: $name"
    pass=$((pass + 1))
  else
    echo "  FAIL: $name"
    echo "    expected pattern: $expected"
    echo "    got: $actual"
    fail=$((fail + 1))
  fi
}

skip_test() {
  echo "  SKIP: $1"
  skip=$((skip + 1))
}

# POST JSON body via temp file (avoids ARG_MAX on large base64 images).
api_post_file() {
  local path="$1" payload_file="$2"
  docker cp "$payload_file" "$CONTAINER:/tmp/payload.json"
  docker exec "$CONTAINER" wget -q -O - \
    --header="x-internal-key: $KEY" \
    --header="Content-Type: application/json" \
    --post-file=/tmp/payload.json \
    "http://127.0.0.1:4000$path" 2>&1
}

send_image_json() {
  local api_path="$1" chat_mid="$2"
  local payload_file
  payload_file=$(mktemp /tmp/line-payload.XXXXXX.json)
  python3 -c "
import json, base64, sys
with open(sys.argv[1], 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
print(json.dumps({'chatMid': sys.argv[2], 'imageBase64': b64}))
" "$CAT_IMG" "$chat_mid" > "$payload_file"
  api_post_file "$api_path" "$payload_file"
  rm -f "$payload_file"
}

echo "=== Safe integration test suite ==="
echo "user=$USER_ID container=$CONTAINER"

echo ""
echo "--- 0a. Download real test image (cat photo from internet) ---"
CAT_IMG="$(mktemp -t line-test-cat).jpg"
if ! curl -sfL --max-time 30 "https://cataas.com/cat?jpg=true" -o "$CAT_IMG"; then
  curl -sfL --max-time 30 "https://placekitten.com/400/400" -o "$CAT_IMG"
fi
IMG_B64=$(python3 -c "import base64,sys; print(base64.b64encode(open(sys.argv[1],'rb').read()).decode())" "$CAT_IMG")
IMG_BYTES=$(wc -c < "$CAT_IMG" | tr -d ' ')
echo "  cat image: $CAT_IMG ($IMG_BYTES bytes, base64 ${#IMG_B64} chars)"

echo ""
echo "--- 0. Sync chats ---"
api POST "/line/$USER_ID/sync" "{}" >/dev/null || true

# Safe chat discovery: provide GROUP_CHAT and optionally SQUARE_CHAT via env vars.
GROUP_CHAT="${GROUP_CHAT:-}"
SQUARE_CHAT="${SQUARE_CHAT:-}"
GROUP_NAME="${GROUP_NAME:-TestGroup}"

if [ -z "$GROUP_CHAT" ]; then
  echo ""
  echo "ABORT: Set GROUP_CHAT env var to a safe test group chatMid."
  echo "  Optionally set SQUARE_CHAT for OpenChat tests."
  exit 1
fi

echo ""
echo "Safe group: $GROUP_NAME ($GROUP_CHAT)"
if [ -n "$SQUARE_CHAT" ]; then
  echo "Safe square: $SQUARE_CHAT"
else
  echo "Safe square: (none — square tests will SKIP)"
fi
export GROUP_CHAT SQUARE_CHAT IMG_B64 KEY CONTAINER USER_ID

echo ""
echo "--- 1. Worker health + session pool ---"
H=$(api GET /health)
check "health ok" '"status":"ok"' "$H"
if echo "$H" | grep -q '"maxHotSessions"'; then
  check "session pool stats" '"maxHotSessions"' "$H"
else
  skip_test "session pool stats (production health — set NODE_ENV=development to expose)"
fi

echo ""
echo "--- 2. LINE session ---"
ST=$(api GET "/line/$USER_ID/status")
check "LINE connected" '"status":"connected"' "$ST"
check "connection phase" '"connectionPhase"' "$ST"

echo ""
echo "--- 3. Send text (safe group) ---"
T1=$(api POST "/line/$USER_ID/send/text" "{\"chatMid\":\"$GROUP_CHAT\",\"text\":\"[Agenda test] safe group text $(date +%H:%M:%S)\"}")
check "send text ok" '"ok":true' "$T1"

echo ""
echo "--- 4. Send image (group) ---"
IMG2=$(send_image_json "/line/$USER_ID/send/image" "$GROUP_CHAT")
check "prod image messageId" 'messageId' "$IMG2"

echo ""
echo "--- 6. Send text (OpenChat/square) ---"
if [ -n "$SQUARE_CHAT" ]; then
  T2=$(api POST "/line/$USER_ID/send/text" "{\"chatMid\":\"$SQUARE_CHAT\",\"text\":\"[Agenda test] square text $(date +%H:%M:%S)\"}")
  check "square text ok" '"ok":true' "$T2"
else
  skip_test "square text (no safe square chat)"
fi

echo ""
echo "--- 6b. Send image (OpenChat/square) ---"
if [ -n "$SQUARE_CHAT" ]; then
  SQIMG=$(send_image_json "/line/$USER_ID/send/image" "$SQUARE_CHAT" || true)
  check "square image messageId" 'messageId' "$SQIMG"
else
  skip_test "square image (no safe square chat)"
fi

echo ""
echo "--- 7. Auto-reply: list rules ---"
RULES=$(api GET "/line/$USER_ID/auto-reply/rules")
check "rules response" '"rules"' "$RULES"

echo ""
echo "--- 8. Auto-reply: delete old test rules ---"
echo "$RULES" | python3 -c "
import json,sys,subprocess,os
d=json.load(sys.stdin)
key=os.environ.get('KEY','')
uid=os.environ.get('USER_ID','')
container=os.environ.get('CONTAINER','line-worker-line-1')
token=subprocess.check_output(['node','-e',\"\"\"
const crypto=require('crypto');
const userId=process.argv[1];
const secret=process.argv[2];
const exp=Math.floor(Date.now()/1000)+120;
const payload=userId+':'+exp;
const sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
process.stdout.write(payload+'.'+sig);
\"\"\", uid, key], text=True)
for r in d.get('rules',[]):
  if '$KEYWORD' in r.get('includeKeywords',[]):
    subprocess.run(['docker','exec',container,
      'wget','-q','-O','-','--method=DELETE',
      '--header','x-internal-key: '+key,
      '--header','x-worker-user-token: '+token.strip(),
      f\"http://127.0.0.1:4000/line/{uid}/auto-reply/rules/{r['id']}\"], check=False, env={**os.environ,'KEY':key,'USER_ID':uid,'CONTAINER':container})
" 2>/dev/null || true

echo ""
echo "--- 9. Auto-reply: create rule ---"
CREATE=$(api POST "/line/$USER_ID/auto-reply/rules" "{
  \"chatMids\": [\"$GROUP_CHAT\"],
  \"includeKeywords\": [\"$KEYWORD\"],
  \"excludeKeywords\": [],
  \"emojiFilter\": \"any\",
  \"replyText\": \"Auto-reply OK\",
  \"matchMode\": \"contains\",
  \"cooldownSec\": 5,
  \"enabled\": true
}")
check "rule created" '"includeKeywords"' "$CREATE"
RULE_ID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('rule',{}).get('id',''))" 2>/dev/null || echo "")

echo ""
echo "--- 10. Auto-reply: listener active ---"
check "runtime listening" '"listening":true' "$CREATE"

echo ""
echo "--- 11. Template with image (DB) ---"
PG_CONTAINER="${POSTGRES_CONTAINER:-line-postgres-1}"
ASSET_ID=$(python3 -c "
import base64, sys
with open(sys.argv[1], 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
uid = sys.argv[2]
print(
    \"INSERT INTO media_assets (user_id, file_name, mime_type, byte_size, data) \"
    f\"SELECT '{uid}', 'test-cat.jpg', 'image/jpeg', \"
    f\"length(decode('{b64}', 'base64')), decode('{b64}', 'base64') RETURNING id;\"
)
" "$CAT_IMG" "$USER_ID" | docker exec -i "$PG_CONTAINER" psql -U line -d line_promotion -t -A 2>/dev/null | head -1 | tr -d '\r')
if [ -n "$ASSET_ID" ]; then
  IMG3=$(api POST "/line/$USER_ID/send/image" "{\"chatMid\":\"$GROUP_CHAT\",\"assetId\":\"$ASSET_ID\"}")
  check "send image from asset" 'messageId' "$IMG3"
else
  echo "  FAIL: media asset insert"
  fail=$((fail + 1))
fi

echo ""
echo "--- 13. Web health ---"
WH=$(curl -sf http://localhost:3000/api/health || echo FAIL)
check "web health" 'ok' "$WH"

echo ""
echo "--- 14. Web auto-reply page (redirect/login ok) ---"
WP=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard/auto-reply || echo 000)
if [ "$WP" = "200" ] || [ "$WP" = "307" ] || [ "$WP" = "302" ]; then
  echo "  PASS: auto-reply page HTTP $WP"
  pass=$((pass + 1))
else
  echo "  FAIL: auto-reply page HTTP $WP"
  fail=$((fail + 1))
fi

echo ""
echo "=== Results: $pass passed, $fail failed, $skip skipped ==="
if [ -n "$RULE_ID" ]; then
  echo ""
  echo "Auto-reply rule active: $RULE_ID"
  echo "พิมพ์ \"$KEYWORD\" ใน $GROUP_NAME เพื่อทดสอบ quote-reply สด"
fi
exit "$fail"
