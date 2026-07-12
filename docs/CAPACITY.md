# Capacity and deployment limits

Agenda runs as a **single `worker-line` process** per deployment. This document describes realistic capacity — not marketing numbers.

## Session pool (LINE connections)

| Setting | Default | Notes |
|---------|---------|--------|
| `MAX_HOT_SESSIONS` | 200 | In-memory LINE clients (hot) |
| `SESSION_IDLE_EVICT_MS` | 300000 (5 min) | Hibernate idle hot sessions |
| Cold sessions | Unlimited (disk) | Token on disk; wake ~0.5–1s |

Load test (Jul 2026): ~10k **cold** sessions on ~8 GB RAM; ~200 hot is the default production-friendly cap.

## Docker Compose profiles

| Service | `mem_limit` in compose | Intended use |
|---------|------------------------|--------------|
| `worker-line` | 1g | **Dev / small** single-user or early launch |
| Production | 4–8g+ recommended | Hundreds of active users with cold hibernate |

The 1g limit in `docker-compose.yml` is intentional for local/dev — not a 10k-user profile.

## Recommended hard caps (single worker)

Without multi-worker sharding:

- **~500–2000 connected accounts** with cold hibernate and coordinator polling (depends on auto-reply rule count and poll frequency)
- **~200 simultaneous hot sessions** before LRU eviction
- Campaign runs and auto-reply coordinator state are **in-memory** — one worker only

Do not run multiple worker replicas behind the same users without sharding (duplicate sends / split brain).

## Out of scope (documented)

- Multi-worker sharding / sticky routing
- Media `bytea` encryption at rest (Postgres volume encryption recommended)
- `thrift` transitive CVE via `@evex/linejs` (upstream)

## Related env vars

See `start.sh` generated `.env` and [`services/worker-line/src/env.ts`](../services/worker-line/src/env.ts).
