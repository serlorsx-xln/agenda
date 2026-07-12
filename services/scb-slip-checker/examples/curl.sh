#!/usr/bin/env bash
# Usage examples for the scb-slip-checker Go server.
set -euo pipefail
BASE="${BASE:-http://localhost:8000}"

# health
curl -s "$BASE/health"; echo

# verify by uploading a slip image (server decodes the QR)
curl -s -X POST "$BASE/verify/image" -F file=@slip.jpg -F amount=10.00 | jq .

# verify with a raw QR string
curl -s -X POST "$BASE/verify" \
     -H "Content-Type: application/json" \
     -d '{"qr":"0042000600000101030060221C202606126163170975185102TH9104817A","amount":10.00}' | jq .
