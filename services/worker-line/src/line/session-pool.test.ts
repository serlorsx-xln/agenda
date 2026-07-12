import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: {
    MAX_HOT_SESSIONS: 2,
    SESSION_IDLE_EVICT_MS: 60_000,
    MAX_BOOT_RESTORE_SESSIONS: 0,
  },
}));

import {
  countHotSessions,
  enforceHotSessionLimit,
  getSessionPoolStats,
  touchSession,
  unregisterSession,
} from "./session-pool.js";

describe("session-pool", () => {
  const clients = new Set<string>();

  beforeEach(() => {
    clients.clear();
    for (const userId of ["u1", "u2", "u3"]) {
      unregisterSession(userId);
    }
  });

  afterEach(() => {
    for (const userId of ["u1", "u2", "u3"]) {
      unregisterSession(userId);
    }
  });

  function hasClient(userId: string): boolean {
    return clients.has(userId);
  }

  function dropClient(userId: string): void {
    clients.delete(userId);
  }

  it("counts only hot sessions that still have a client", () => {
    touchSession("u1");
    touchSession("u2");
    clients.add("u1");
    expect(countHotSessions(hasClient)).toBe(1);
  });

  it("evicts oldest hot session when over MAX_HOT_SESSIONS", async () => {
    vi.useFakeTimers();
    touchSession("u1");
    vi.advanceTimersByTime(10);
    touchSession("u2");
    vi.advanceTimersByTime(10);
    touchSession("u3");
    clients.add("u1");
    clients.add("u2");
    clients.add("u3");

    const evicted = await enforceHotSessionLimit(hasClient, dropClient);
    expect(evicted).toBe(1);
    expect(clients.has("u1")).toBe(false);
    expect(clients.has("u2")).toBe(true);
    expect(clients.has("u3")).toBe(true);
    vi.useRealTimers();
  });

  it("does not evict the excluded user during enforceHotSessionLimit", async () => {
    vi.useFakeTimers();
    touchSession("u1");
    vi.advanceTimersByTime(10);
    touchSession("u2");
    vi.advanceTimersByTime(10);
    touchSession("u3");
    clients.add("u1");
    clients.add("u2");
    clients.add("u3");

    await enforceHotSessionLimit(hasClient, dropClient, "u1");
    expect(clients.has("u1")).toBe(true);
    expect(clients.size).toBe(2);
    vi.useRealTimers();
  });

  it("reports pool stats", () => {
    touchSession("u1");
    clients.add("u1");
    const stats = getSessionPoolStats(hasClient, 5);
    expect(stats.maxHotSessions).toBe(2);
    expect(stats.hotSessions).toBe(1);
    expect(stats.registeredSessions).toBe(5);
    expect(stats.lazyBootRestore).toBe(true);
  });
});
