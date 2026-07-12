# Agenda

A production-grade assistant for **scheduling promotional messages to the LINE
OpenChats/groups you already belong to**, using a personal LINE account. It is a
careful, human-paced promotion helper — **not** a mass-distribution or spam tool.

- Connect your own LINE account (QR login, later, from the dashboard)
- Discover your OpenChats, write reusable templates
- Schedule campaigns with sending windows, simple daily schedules, limits, and
  randomized delays
- Monitor runs live, per target, with auto-stop on repeated errors

> Automating a personal LINE account carries real risk (rate-limits or bans). We
> default to conservative settings, but we make no guarantees. Use responsibly
> and only for chats you own or belong to.

## Tech stack

- **Web**: Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui, lucide
  icons, next-intl (TH/EN), next-themes (light/dark + accent presets), TanStack
  Query, react-hook-form + zod.
- **Auth**: Better Auth (email/password, sessions, roles).
- **DB**: PostgreSQL 16 + Drizzle ORM (shared `@line/db` package).
- **Worker**: Node.js service using [`@evex/linejs`](https://jsr.io/@evex/linejs)
  (personal account, QR login, device `ANDROIDSECONDARY`). No browser
  automation.
- **Scheduling**: `node-cron` + an in-process daemon loop.
- **Payments**: PromptPay QR + **SCB slip verification** (self-hosted
  `scb-slip-checker` service; auto-fulfill on amount/receiver/TRAN match).

No Python anywhere. No headless browser.

## Repository layout

```
.
├─ apps/web/              Next.js app (landing, auth, dashboard, admin, API)
├─ services/worker-line/  Node worker: linejs QR/session, discovery, scheduler
├─ packages/db/           Drizzle schema, client, migrations, seed (shared)
├─ packages/shared/       Plan definitions, image-asset helpers, Sentry init
├─ docker-compose.yml     web + worker-line + postgres
├─ .env.example
├─ eslint.config.mjs      Shared flat ESLint config (monorepo)
├─ knip.json              Dead-code detection config
└─ pnpm-workspace.yaml
```

### Architecture

- The **web** app and **worker-line** both use the shared `@line/db` package;
  the worker writes run/event/status rows directly to Postgres (source of
  truth).
- The web calls the worker over the internal Docker network for control
  commands (start/cancel QR login, PIN, status, disconnect, sync, test send,
  campaign run, cancel run), authenticated with `INTERNAL_API_KEY`.
- linejs session secrets never touch the database — they are persisted to a
  Docker volume mounted at `/data/session` on the worker.

## Quick start (Docker only)

Everything runs in Docker Compose — web, worker, postgres, migrations, and SCB
slip services. There is no supported host-side `pnpm dev` path.

1. Copy env and fill in secrets:

```bash
cp .env.example .env
# Generate strong secrets (openssl rand -base64 32 / openssl rand -hex 32).
# Keep DATABASE_URL on the compose network: …@postgres:5432/…
# Keep WORKER_LINE_URL / SCB_SLIP_URL on service names, not localhost.
```

2. Bring everything up (migrations run automatically via the `migrate` service):

```bash
docker compose up --build -d
```

3. Optional one-time settings seed:

```bash
docker compose run --rm migrate pnpm seed
```

4. Open http://localhost:3000 (host port published by `web`), sign up, then
   connect LINE via QR.

Healthchecks: web `GET /api/health`, worker `GET /health`, postgres
`pg_isready`. Production TLS: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.

## Environment variables

| Variable                 | Used by        | Description                                             |
| ------------------------ | -------------- | ------------------------------------------------------ |
| `POSTGRES_USER/PASSWORD/DB` | postgres    | Database credentials                                   |
| `DATABASE_URL`           | web, worker, migrate | `postgres://…@postgres:5432/…` (compose network) |
| `BETTER_AUTH_SECRET`     | web            | Auth signing secret (>= 32 chars)                      |
| `BETTER_AUTH_URL`        | web            | Browser-facing public URL (`http://localhost:3000` or HTTPS domain) |
| `NEXT_PUBLIC_APP_URL`    | web            | Same public URL for the client                         |
| `WORKER_LINE_URL`        | web            | `http://worker-line:4000` (compose network)            |
| `INTERNAL_API_KEY`       | web, worker    | Shared secret for internal API calls                   |
| `WORKER_PORT`            | worker         | Worker HTTP port (default 4000)                        |
| `LINE_DEVICE`            | worker         | linejs device to emulate (`ANDROIDSECONDARY`)          |
| `LINE_SESSION_PATH`      | worker         | Path (in the session volume) for the linejs session    |
| `SCHEDULER_TICK_SECONDS` | worker         | Daemon tick interval                                   |
| `PROMPTPAY_ID`           | web            | PromptPay phone (digits) for QR + slip receiver match  |
| `SCB_API_KEY`            | web, scb-*     | Internal Bearer secret (not a bank/SCB Open API key)   |
| `SCB_SLIP_URL`           | web            | `http://scb-slip:8000` (compose network)               |
| `SESSION_ENCRYPTION_KEY` | worker         | AES key for LINE session files at rest                 |
| `MAX_HOT_SESSIONS`       | worker         | Max LINE clients in RAM (default 200)                  |
| `MAX_BOOT_RESTORE_SESSIONS` | worker      | Sessions to auto-resume on boot (default 1)            |
| `SESSION_IDLE_EVICT_MS`  | worker         | Hibernate idle clients after ms (default 300000)       |
| `AUTO_REPLY_CYCLE_SEC`   | worker         | Coordinator poll cycle target (default 30)             |
| `BILLING_WEBHOOK_SECRET` | web            | Ops webhook auth                                       |
| `CRON_SECRET`            | web            | Auth for `/api/cron/*` maintenance routes              |

## Fonts (LINE Seed Sans)

Fonts are self-hosted. Download **LINE Seed Sans TH** from
https://seed.line.me/index_en.html and place the `.woff2` files in
`apps/web/public/fonts/` (see the README there for exact filenames). Until then,
the app falls back to the system sans-serif stack.

## Scripts

```bash
pnpm build       # build all packages
pnpm typecheck   # typecheck all packages
pnpm lint        # lint all packages (unified ESLint flat config)
pnpm knip        # detect unused files, exports, and dependencies
pnpm db:generate # generate Drizzle migration from schema
pnpm db:migrate  # apply migrations
pnpm db:seed     # seed settings scaffold (no default targets/campaigns)
```

## Safety & positioning

- Framed as an assistant for chats you own/belong to, not spam blasting.
- Conservative default send rate with randomized delays (jitter).
- Auto-stop on consecutive failures or session loss; runs always emit a final
  status.
- The Connect LINE screen shows a clear risk notice. We never promise you
  "won't get banned".

## PromptPay billing (SCB slip)

1. User chooses Starter/Pro → pending payment + PromptPay QR (`PROMPTPAY_ID`).
2. User pays, then uploads the bank slip in the Billing UI.
3. Web verifies via internal `scb-slip` (SCB Check Slip) and business matchers
   (amount, receiver, one-time TRAN).
4. Subscription upgrades; receipt email is sent when Resend is configured.

See `docs/DEPLOYMENT.md` and `docs/RUNBOOK.md` for secrets, TTL, and fail codes.

## Disclaimer

Not affiliated with LINE Corporation. You are responsible for complying with
LINE's Terms of Service and applicable laws.
