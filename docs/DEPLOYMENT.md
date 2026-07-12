# Deployment

Deploy Agenda with Docker Compose (VPS + optional Caddy TLS).

## Prerequisites

- Docker 24+ and Docker Compose v2
- Strong secrets (see `.env.example`)
- PromptPay phone number for receiving payments
- Public DNS when using TLS (prod overlay)

## Required production secrets

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` / `POSTGRES_*` | Postgres |
| `BETTER_AUTH_SECRET` | Session signing (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | Public web URL |
| `INTERNAL_API_KEY` | Web ↔ worker (`openssl rand -hex 32`) |
| `SESSION_ENCRYPTION_KEY` | AES key for LINE session files (`openssl rand -hex 32`) |
| `PROMPTPAY_ID` | PromptPay phone (digits) shown on QR + slip receiver check |
| `SCB_API_KEY` | Internal Bearer secret we invent for `scb-slip` / `scb-captcha` (not a bank/SCB Open API key; `openssl rand -hex 32`) |
| `SCB_SLIP_URL` | Internal: `http://scb-slip:8000` in Compose |
| `BILLING_WEBHOOK_SECRET` | Ops webhook auth |
| `BILLING_OPS_TOKEN` | Extra token for manual ops webhook body |
| `CRON_SECRET` | Cron routes (no fallback to `INTERNAL_API_KEY` in production) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Email verification + receipts |

Optional: `SCB_PROXY` (residential proxy if Imperva blocks your IP), `SENTRY_DSN`.

## Docker Compose only (home network / single VPS)

All runtime services live on the compose network. Use service hostnames in
`.env` (`postgres`, `worker-line`, `scb-slip`) — not host `localhost` — for
internal URLs. `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` stay browser-facing
(`http://localhost:3000` when you open the published host port).

```bash
cp .env.example .env
# Fill secrets, then:
docker compose up --build -d
```

Services:

- `postgres` (internal only, no host port)
- `migrate` (one-shot drizzle migrations)
- `scb-captcha`, `scb-slip` (internal only)
- `worker-line` (LINE sessions encrypted on volume)
- `web` (published as `http://localhost:3000`)

After pulling updates that include migration `0013_campaign_send_queue` (round-robin
send queue), run migrations and rebuild worker + web:

```bash
docker compose run --rm migrate pnpm migrate
docker compose up --build -d worker-line web
```

Bootstrap first admin: sign up, then set `role = 'admin'` on the `user` row in Postgres.

## Production + TLS

```bash
# In .env set:
#   APP_DOMAIN / ACME_EMAIL
#   BETTER_AUTH_URL=https://your.domain.example
#   NEXT_PUBLIC_APP_URL=https://your.domain.example
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Adds Caddy (80/443), daily `pg_dump` backups, and hourly billing/notification cron.

## Payment flow

1. User chooses Starter/Pro → pending payment + PromptPay QR (whole baht)
2. User pays and uploads slip image
3. Web calls `scb-slip` → SCB Check Slip → match amount + receiver + unique TRAN
4. Subscription upgrades; receipt email sent

Manual ops fallback (if SCB is down): admin confirm in dashboard, or
`POST /api/billing/webhook` with `BILLING_WEBHOOK_SECRET` + `opsToken`.

## Smoke test (messaging)

With a connected LINE account:

```bash
pnpm smoke -- <userId> <groupChatMid> <openChatMid>
```
