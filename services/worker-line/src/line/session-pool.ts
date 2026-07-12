import { env } from "../env.js";

/** Tracks in-memory LINE client usage for LRU hibernation. */
const lastUsedAt = new Map<string, number>();

export type SessionPoolStats = {
  maxHotSessions: number;
  hotSessions: number;
  registeredSessions: number;
  idleEvictMs: number;
  lazyBootRestore: boolean;
};

export function touchSession(userId: string): void {
  lastUsedAt.set(userId, Date.now());
}

export function unregisterSession(userId: string): void {
  lastUsedAt.delete(userId);
}

export function countHotSessions(
  hasClient: (userId: string) => boolean,
): number {
  let n = 0;
  for (const userId of lastUsedAt.keys()) {
    if (hasClient(userId)) n += 1;
  }
  return n;
}

/** Drop in-memory client only — token + files on disk stay valid. */
export function hibernateSession(
  userId: string,
  dropClient: (userId: string) => void,
): boolean {
  dropClient(userId);
  return true;
}

export async function enforceHotSessionLimit(
  hasClient: (userId: string) => boolean,
  hibernate: (userId: string) => void,
  excludeUserId?: string,
): Promise<number> {
  let evicted = 0;
  const max = env.MAX_HOT_SESSIONS;
  if (max <= 0) return 0;

  while (countHotSessions(hasClient) > max) {
    let oldestUser: string | null = null;
    let oldestTs = Infinity;
    for (const [userId, ts] of lastUsedAt) {
      if (userId === excludeUserId || !hasClient(userId)) continue;
      if (ts < oldestTs) {
        oldestTs = ts;
        oldestUser = userId;
      }
    }
    if (!oldestUser) break;
    hibernate(oldestUser);
    evicted += 1;
  }
  return evicted;
}

let evictionTimer: NodeJS.Timeout | null = null;

export function startSessionEvictionSweep(
  hasClient: (userId: string) => boolean,
  hibernate: (userId: string) => void,
): void {
  if (evictionTimer || env.SESSION_IDLE_EVICT_MS <= 0) return;
  evictionTimer = setInterval(() => {
    const cutoff = Date.now() - env.SESSION_IDLE_EVICT_MS;
    for (const [userId, ts] of lastUsedAt) {
      if (!hasClient(userId)) continue;
      if (ts >= cutoff) continue;
      hibernate(userId);
    }
    void enforceHotSessionLimit(hasClient, hibernate);
  }, Math.min(env.SESSION_IDLE_EVICT_MS, 60_000));
  evictionTimer.unref?.();
}

export function stopSessionEvictionSweep(): void {
  if (evictionTimer) clearInterval(evictionTimer);
  evictionTimer = null;
}

export function getSessionPoolStats(
  hasClient: (userId: string) => boolean,
  registeredCount: number,
): SessionPoolStats {
  return {
    maxHotSessions: env.MAX_HOT_SESSIONS,
    hotSessions: countHotSessions(hasClient),
    registeredSessions: registeredCount,
    idleEvictMs: env.SESSION_IDLE_EVICT_MS,
    lazyBootRestore: env.MAX_BOOT_RESTORE_SESSIONS === 0,
  };
}
