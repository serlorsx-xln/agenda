# Runbook

Operational procedures for Agenda.

## Health checks

| Endpoint | Expected |
|----------|----------|
| `GET /api/health` (web) | `{ status: "ok", db: true, worker: true }` |
| `GET /health` (worker-line) | `{ status: "ok" }` (prod omits session counts) |
| `GET /health` (scb-slip) | `{ status: "ok", ... }` (internal only) |

## Billing / slip failures

Map `error` from `POST /api/billing/payments/:id/slip`:

| Error | Action |
|-------|--------|
| `not_found` | User paid wrong amount or slip not on SCB yet — wait and retry |
| `amount_mismatch` | Recreate payment with correct plan amount |
| `receiver_mismatch` | Confirm `PROMPTPAY_ID` matches the receiving account |
| `already_used` | Slip TRAN already credited — do not reuse |
| `invalid_qr` | Ask for a clearer slip photo |
| `timeout` / `upstream_error` (`9998`) | SCB / Imperva issues — retry, consider `SCB_PROXY` |
| `expired` | Payment TTL (default 30m + 15m grace) elapsed — create new intent |
| `rate_limited` | Too many uploads; wait |

Admin manual confirm remains available when SCB is unavailable.

## LINE connection

1. **Connected but group send fails** — use **Reset encryption keys** on Connect page
2. Worker logs `e2ee_keys_invalid` on token resume → same reset flow
3. Session files live under `/data/session` (ciphertext when `SESSION_ENCRYPTION_KEY` is set)
4. If volume wiped, every user must re-scan QR

## Worker / LTSM bridge

1. Bridge child exits are recovered on next send (`ltsm bridge exited, will restart…`)
2. `/health` returns 503 when LTSM is unhealthy
3. Restart worker: `docker compose restart worker-line`

## Subscription lifecycle

Hourly (prod overlay `billing-cron`):

- Expire pending payments past TTL+grace
- Active paid plans past `currentPeriodEnd` → `past_due` (grace 3 days)
- After grace → `free` / `inactive`
- Reminder emails: 7d, 1d, past_due day 1

Manual trigger:

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://your.domain/api/cron/billing
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://your.domain/api/cron/notifications
```

## Backups

`db-backup` writes `/backups/line-*.dump` daily and deletes older than 14 days.
Restore with `pg_restore`.
