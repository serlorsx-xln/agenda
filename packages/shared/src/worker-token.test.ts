import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWorkerUserToken,
  extractLineUserIdFromPath,
  verifyWorkerUserToken,
} from "./worker-token.js";

describe("worker-token", () => {
  const secret = "test-internal-key-16chars";

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates and verifies a user-bound token", () => {
    const token = createWorkerUserToken("user-abc", secret);
    const verified = verifyWorkerUserToken(token, secret);
    expect(verified).toEqual({ userId: "user-abc" });
  });

  it("rejects tokens signed with a different secret", () => {
    const token = createWorkerUserToken("user-abc", secret);
    expect(verifyWorkerUserToken(token, "other-secret-key!!")).toBeNull();
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T10:00:00Z"));
    const token = createWorkerUserToken("user-abc", secret);
    vi.setSystemTime(new Date("2026-07-08T10:05:00Z"));
    expect(verifyWorkerUserToken(token, secret)).toBeNull();
  });

  it("extracts userId from worker paths", () => {
    expect(extractLineUserIdFromPath("/line/user-1/status")).toBe("user-1");
    expect(extractLineUserIdFromPath("/health")).toBeUndefined();
  });
});
