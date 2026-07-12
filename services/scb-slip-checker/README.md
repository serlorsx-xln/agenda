# scb-slip-checker (Go)

Verify Thai bank-transfer slips against SCB's [checkslip.scb.co.th](https://checkslip.scb.co.th)
as a **single static Go binary** — the captcha-solving CNN runs in pure Go with the weights
**embedded in the binary** (`//go:embed`). No Python, torch, onnx, or any runtime dependency.
Drop one file on a VPS and run it.

- 🧠 **Pure-Go CNN** — conv/bn/relu/maxpool/adaptive-pool/fc reimplemented (im2col + parallel GEMM, ~50 ms/solve). Verified to match the original PyTorch model (logit diff ~0.008, identical answers).
- 🔐 **TLS impersonation** ([`bogdanfinn/tls-client`](https://github.com/bogdanfinn/tls-client), Chrome JA3/HTTP2) to pass Imperva.
- 🔎 **Auto bank/tran** from the slip QR (EMVCo TLV); QR decoded from an uploaded image server-side.
- 📋 **Bilingual (TH/EN)** structured response + custom numeric status codes.
- 🎨 **Pretty colored logs** (every step + timings + per-request id).

> For verifying your own / your shop's slips. Use responsibly and within SCB's terms of service.

## Quick start

```bash
go build -o scbslip .      # ~20 MB single binary, model embedded
./scbslip                  # listens on :8000  (PORT env to change)
```

```bash
# easiest: upload a slip image with the bundled stdlib client (no deps)
python verify_client.py slip.jpg 10.00

# or with curl — by image (server decodes the QR):
curl -X POST http://localhost:8000/verify/image -F file=@slip.jpg -F amount=10.00

# or if you already have the QR string:
curl -X POST http://localhost:8000/verify \
     -H "Content-Type: application/json" \
     -d '{"qr":"0042000600...","amount":10.00}'
```

## Endpoints

| method | path | body | notes |
|--------|------|------|-------|
| POST | `/verify` | `{"qr":"...","amount":10.0}` | QR string |
| POST | `/verify/image` | multipart `file` + `amount` | server decodes the QR |
| GET | `/health` | — | liveness |

## Response (example, a real "found" slip)

```json
{
  "RETURN_CODE": "0000",
  "STATUS": "FOUND",
  "TRAN": "C20260612616317097518",
  "BANK": "006",
  "SLIP_DATA": {
    "VERIFICATION": { "TH": "พบสลิป", "EN": "Found" },
    "REF_ID": "C20260612616317097518",
    "TXN_INFO": {
      "CURRENCY": "THB",
      "TXN_DATE": { "TH": "วัน...", "EN": "Fri 12 June 2026 5:33 PM" },
      "TXN_AMT": 10, "DISP_AMT": { "TH": "10.00", "EN": "10.00" }
    },
    "SENDER_INFO":   { "BANK_NAME": {"TH":"...","EN":"KRUNG THAI BANK..."}, "ACCT_NAME": {"TH":"...","EN":"..."}, "ACCT_NUM": "XXX-X-XX984-2" },
    "RECEIVER_INFO": { "BANK_NAME": {"TH":"...","EN":"KASIKORNBANK"}, "ACCT_NAME": {"TH":"procreate brush","EN":"procreate brush"}, "ACCT_NUM": "010753600031508" },
    "REFERENCES": ["KB000001917782", "KPS004KB000001917782", "42086900"]
  },
  "SOLVER": { "answer": "G6BKS2", "confidence": 0.9999, "pass_threshold": true }
}
```

### Status codes

| code | status | meaning |
|------|--------|---------|
| `0000` | FOUND | slip found → `SLIP_DATA` |
| `0001` | NOT_FOUND | not found / unavailable |
| `0002` | INVALID_PARAMS | bad parameters |
| `7777` | INVALID_QR | unparseable/unsupported QR |
| `8888` | CAPTCHA_FAILED | captcha rejected after retries |
| `9998` | UPSTREAM_ERROR | network / non-200 / Imperva block |
| `9999` | SYSTEM_ERROR | unexpected |

## Usage examples

See [`examples/`](examples/): [`client.py`](examples/client.py) (stdlib only), [`client.js`](examples/client.js) (Node fetch), [`curl.sh`](examples/curl.sh).

```python
# examples/client.py — POST a slip image, print the JSON result
import urllib.request, json, uuid, sys

def verify(path, amount, url="http://localhost:8000/verify/image"):
    img = open(path, "rb").read()
    b = "----" + uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"amount\"\r\n\r\n{amount}\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"slip.jpg\"\r\n"
            f"Content-Type: image/jpeg\r\n\r\n").encode() + img + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(url, body, {"Content-Type": f"multipart/form-data; boundary={b}"})
    return json.load(urllib.request.urlopen(req, timeout=180))

print(verify(sys.argv[1], sys.argv[2]))
```

## Environment

| env | default | meaning |
|-----|---------|---------|
| `PORT` | `8000` | listen port |
| `MAX_ATTEMPTS` | `3` | captcha retries |
| `PREFETCH` | `0` | `1` = pre-solve captchas in the background → ~250 ms off each request (adds steady SCB load; best for high traffic) |
| `PREFETCH_SIZE` | `3` | pre-solved captchas kept ready |
| `PROXY` | — | residential proxy if Imperva blocks the host IP |
| `LOG_LEVEL` | `info` | `debug` also logs every HTTP call |
| `NO_COLOR` / `FORCE_COLOR` | — | force-disable / force-enable colored logs |

## Deploy on a VPS

```bash
GOOS=linux GOARCH=amd64 go build -o scbslip .   # cross-compile a Linux binary
scp scbslip user@vps:~ && ssh user@vps 'PORT=8000 ./scbslip'
```

Or a ~20 MB scratch image:

```dockerfile
FROM golang:1.26 AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /scbslip .
FROM scratch
COPY --from=build /scbslip /scbslip
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
EXPOSE 8000
ENTRYPOINT ["/scbslip"]
```

> ⚠️ **Imperva**: SCB sits behind Imperva, which also scores IP reputation. From a clean / residential
> IP `tls-client` is enough; from flagged datacenter ranges set `PROXY` to a residential proxy.
> Blocks (HTTP 403 or a `200` Incapsula page) surface as `UPSTREAM_ERROR`.

## Retrain / re-export the model

`model/model.bin` is committed (the binary builds without Python). To regenerate from `models/captcha_cnn.pt`:

```bash
pip install torch
python export_model.py        # -> model/model.bin
go test ./model               # parity tests (committed fixtures)
```

## Layout

```
main.go            HTTP server (/verify, /verify/image, /health)
log.go             pretty colored slog handler + startup banner
vt_windows.go      enable ANSI colors on Windows consoles
model/cnn.go       pure-Go CNN (im2col + parallel GEMM) + Lanczos preprocess
model/weights.go   //go:embed model.bin
model/model.bin    embedded weights
model/cnn_test.go  parity vs PyTorch (model/testdata/)
scb/client.go      tls-client SCB flow (captcha island, verify, result island)
scb/service.go     orchestration: load → CNN solve → verify → result (retry) + logging
scb/qr.go          QR decode + EMVCo TLV (bank/tran)
scb/parse.go       captcha + result HTML parsing → bilingual SLIP_DATA
scb/status.go      status codes + Result
export_model.py    PyTorch .pt → model/model.bin
models/captcha_cnn.pt   original PyTorch model (for re-export)
```
```
