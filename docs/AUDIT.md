# Deep Audit Report — Safe Retest + Hibernation

**Date:** 2026-07-07  
**Scope:** Full repo audit after session-pool hibernation + safe test harness  
**Stack:** Docker Compose (`line-worker-line`, `line-web`, `line-postgres`)

---

## Executive summary

| Area | Result |
|------|--------|
| Safe test harness | ✅ Fail-closed; no hardcoded chat mids |
| Hibernation (10k model) | ✅ 9800 cold + 200 hot on 8 GB (load test) |
| Group send / auto-reply | ✅ Pass on safe chats (real cat JPEG from internet) |
| Square text + image | ✅ Pass |
| Unit / typecheck / web build | ✅ Pass |
| P1 fixes (plan) | ✅ Implemented (see below) |

---

## Test matrix results

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | `pnpm test` (monorepo) | **PASS** | 27 tests |
| 2 | `@line/worker-line` typecheck | **PASS** | |
| 3 | `@line/web` typecheck + build | **PASS** | Next.js 15.5.20 |
| 4 | Worker `/health` | **PASS** | LTSM ok |
| 5 | LINE `/status` connected | **PASS** | `connectionPhase`: hot/cold |
| 6 | Safe discovery `/test-chats/safe` | **PASS** | Group `%Test%` + `memberCount=2` |
| 7 | Send text (safe group) | **PASS** | e.g. `Testing`, `RateTestGroup-*` |
| 8 | Send image (group) | **PASS** | LTSM E2EE + asset |
| 9 | Send text (safe square) | **PASS** | `Messaging test N` |
| 10 | Send image (square) | **PASS** | Real cat JPEG via OBS `uploadObjTalk` (g2) — no follow-up `sendMessage` |
| 11 | Auto-reply CRUD | **PASS** | Multi-chat rules with include/exclude/emoji filters |
| 12 | Coordinator listening | **PASS** | Round-robin global coordinator |
| 13 | Session pool env | **PASS** | `MAX_HOT=200`, `HIBERNATE_AFTER_AUTO_REPLY_POLL=true` |
| 14 | Hibernate wake | **PASS** | `connected_cold` → send → ~0.5–1s wake |
| 15 | Worker restart | **PASS** | Auto-reply rules restored, `listening=true` |
| 16 | Web smoke | **PASS** | `/api/health`, dashboard pages |
| 17 | Integration smoke script | **PASS** | After `${2:-\{\}}` bash fix |
| 18 | Session loadtest | **PASS** | 10k hibernation model; see `loadtest-report.json` |
| 19 | Session pool dev stats | **SKIP** | `NODE_ENV=production` omits pool fields on `/health` |

**Manual (not automated):** Live quote-reply — create rule on safe group(s), second account types matching keywords.

---

## P1 — Fixed in this pass

| # | Issue | Fix | Files |
|---|-------|-----|-------|
| 1 | OpenChat auto-reply used Talk inbox → `[]` | `fetchRecentSquareChatMessages` + sync tokens in coordinator | `manager.ts`, `auto-reply.ts`, `index.ts` |
| 2 | `disconnect()` did not stop auto-reply | `stopAutoReplyListener(userId)` before teardown | `manager.ts` |
| 3 | Hibernation state misleading | `connectionPhase` (`connected_hot` / `connected_cold`); `isSessionReady()` = resumable token; `hotSessionCount()` | `manager.ts`, `server.ts` |
| 4 | Square image `ILLEGAL_ARGUMENT` | **Fixed:** OpenChat images are committed by `uploadObjTalk` alone; removed erroneous `square.sendMessage` | `ltsm-bridge.ts` |
| 5 | Test scripts hit real groups | `findSafeTestChats` + fail-closed scripts | `manager.ts`, `server.ts`, `scripts/*` |

**Additional fix (discovery):** Group `member_count` was always null — `getChats` returns counts in `extra.groupExtra.memberMids`, not top-level `memberMids`. Fixed in `resolveGroupMemberCounts()`.

---

## P2 — Should fix (documented)

| # | Issue | Impact | Recommendation |
|---|-------|--------|----------------|
| 1 | Cooldown `break` skips lower-priority rules in same message | One keyword can block others in same poll tick | **Fixed:** `continue` to next rule | `auto-reply.ts` |
| 2 | `seenByChat` unbounded | Long-running workers grow memory | **Fixed:** Cap per chat (500 message ids, FIFO trim) |
| 3 | Web auto-reply swallows worker errors | UI shows success when worker failed | **Fixed:** Banner + specific error toasts | `auto-reply/page.tsx`, `auto-reply-client.tsx` |
| 4 | Campaign `isSessionReady` vs cold session | Campaign may skip hibernated users incorrectly | **Mitigated:** `isSessionReady` now true for cold/resumable |
| 5 | Worker internal API single shared key | Any holder can act as any user | Per-user JWT or signed userId in web→worker calls | `server.ts` |

---

## P3 — Security / ops

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | API key compare not timing-safe | Low (internal network) | **Fixed:** `crypto.timingSafeEqual` in worker + web | `server.ts`, `crypto-secrets.ts` |
| 2 | `CRON_SECRET` dev fallback | Medium in dev | Ensure production always sets secret |
| 3 | `SESSION_ENCRYPTION_KEY` optional in compose default | High if unset | `start.sh` now generates; verify prod |
| 4 | Media `bytea` not encrypted at rest | Medium | Document; encrypt column or use object storage |
| 5 | `pnpm audit` — `thrift` via `@evex/linejs` | High (transitive) | Upstream linejs; no direct fix in repo |

---

## Test / docs gaps

- No unit tests for `session-pool`, coordinator, `findSafeTestChats`, square message fetch
- `start.sh` template now includes session pool env vars ✅
- Smoke vs integration unified on `%Test%` + `memberCount=2` ✅
- Square image: multi-image grids not possible in OpenChat via self-bot API (send as separate images)

---

## Safe test chat policy

Test scripts require explicit `GROUP_CHAT` (and optionally `SQUARE_CHAT`) env
vars pointing to a safe test chat mid. The dev-only `/test-chats/safe` endpoint
was removed in the July 2026 cleanup — scripts now use production send routes
with user-supplied mids.

---

## Hibernation architecture (verified)

```
connected + client in RAM  → connectionPhase: connected_hot
connected + token on disk  → connectionPhase: connected_cold (after poll/evict)
disconnected               → session files removed (explicit disconnect only)
```

Load test (2026-07-07):

- 9800 cold sessions on disk (~97 MB)
- 200 hot cap enforced
- 3000 auto-reply users in coordinator ~0.2% CPU soak
- Real wake latency ~1037 ms
- **10k all-hot:** not feasible (~16 GB RAM estimate)

---

## Files changed (implementation)

- `services/worker-line/src/line/manager.ts` — safe discovery, square fetch, hibernation state, member counts, disconnect
- `services/worker-line/src/line/auto-reply.ts` — square sync tokens, fetchMessages userId
- `services/worker-line/src/line/ltsm-bridge.ts` — square image OBS path
- `services/worker-line/src/api/server.ts` — `/test-chats/safe`, health pool stats (dev)
- `services/worker-line/src/index.ts` — wire `fetchRecentMessagesForChat`
- `scripts/test-full-integration.sh` — safe-only, no hardcoded mids
- `scripts/integration-smoke-test.sh` — safe-only, docker exec, bash `{}` fix
- `start.sh` — session pool env template

---

## Remaining recommendations

1. **Square image:** Multi-image grids render as separate uploads in OpenChat (LINE API limitation); groups support native grid via X-Talk-Meta.
2. **Production health:** Expose `hotSessions` / `maxHotSessions` in prod (sanitized) for ops.
3. **Campaign window-only:** First run occurs on first scheduler tick inside the window (no exact clock time).

---

## Super Deep Audit remediation (Jul 2026)

### Phase A — Trust and enforcement (done)

- Signed `x-worker-user-token` on web→worker calls (`packages/shared/src/worker-token.ts`)
- Trial expiry + worker enforce Free limits for campaigns, targets, auto-reply rules, media assets
- Worker-side campaign/run ownership checks

### Phase B — Reliability (done)

- Auto-reply UI + campaign runner filter `line_chats.present = true`
- Stale `chatMids` pruned from auto-reply rules on chat sync
- Square sync tokens persisted on `line_chats.square_sync_token`
- E2EE degraded status on `/line/:userId/status` + dashboard banners
- CI smoke env alignment + user token headers

### Phase C — Quality and security (done)

- Unit tests: session-pool, auto-reply coordinator, runner window, worker-token, E2EE status, media magic bytes
- Upgrade dialog for auto-reply + media plan limits
- Landing/billing show auto-reply + media limits; dashboard overview stats
- a11y: delete confirmation dialogs, aria-live on auto-reply status
- Media upload magic-byte validation; CSP/HSTS security headers
- Sentry `captureException` on worker API + campaign runner errors

### Documented limits

See [`docs/CAPACITY.md`](CAPACITY.md) — single worker, compose `mem_limit: 1g` = dev profile.

---

## Out of scope (per plan)

- Multi-worker sharding
- Media encryption at rest
- Full per-user worker JWT (design only above)
