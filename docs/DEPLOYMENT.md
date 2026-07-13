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
| `SCB_SLIP_URL` | slynxslip base URL (`https://slynxslip-service.slynxstudio.net`) |
| `SCB_API_KEY` | slynxslip Bearer key (`sly_…`) for the Agenda project |
| `SCB_PROJECT` | slynxslip project slug (`agenda`) — sent as `X-Project` |
| `BILLING_WEBHOOK_SECRET` | Ops webhook auth |
| `BILLING_OPS_TOKEN` | Extra token for manual ops webhook body |
| `CRON_SECRET` | Cron routes (no fallback to `INTERNAL_API_KEY` in production) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Email verification + receipts |

Optional: `SENTRY_DSN`.

## Coolify / Traefik note

`web` joins the external Docker network `coolify` so Traefik can reach it after
redeploys. On the little host, these keep the domain from staying on 404:

- `/usr/local/bin/agenda-proxy-heal.sh` — reconnects proxy/app networks
- `agenda-proxy-watch.service` — runs heal immediately when web/proxy containers start
- cron every minute as a backup

## Docker Compose only (home network / single VPS)

All runtime services live on the compose network. Use service hostnames in
`.env` (`postgres`, `worker-line`) — not host `localhost` — for internal URLs.
Point `SCB_SLIP_URL` / `SCB_API_KEY` / `SCB_PROJECT` at external slynxslip.
`BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` stay browser-facing
(`http://localhost:3000` when you open the published host port).

```bash
cp .env.example .env
# Fill secrets, then:
# Compose expects an external network named `coolify` (Coolify creates it;
# locally: `docker network create coolify` or use ./start.sh).
docker compose up --build -d
```

Services:

- `postgres` (internal only, no host port)
- `migrate` (one-shot drizzle migrations)
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
3. Web calls slynxslip → SCB Check Slip → match amount + receiver + unique TRAN
4. Subscription upgrades; receipt email sent

Manual ops fallback (if slynxslip is down): admin confirm in dashboard, or
`POST /api/billing/webhook` with `BILLING_WEBHOOK_SECRET` + `opsToken`.

## Smoke test (messaging)

With a connected LINE account:

```bash
pnpm smoke -- <userId> <groupChatMid> <openChatMid>
```
