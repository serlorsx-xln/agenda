import { describe, expect, it } from "vitest";

import {
  getE2eeStatus,
  recordE2eeDecryptFailure,
} from "./manager.js";

describe("E2EE degraded status", () => {
  const userId = "e2ee-test-user";

  it("returns ok initially", () => {
    expect(getE2eeStatus(userId)).toBe("ok");
  });

  it("returns degraded after repeated decrypt failures", () => {
    recordE2eeDecryptFailure(userId);
    recordE2eeDecryptFailure(userId);
    expect(getE2eeStatus(userId)).toBe("ok");
    recordE2eeDecryptFailure(userId);
    expect(getE2eeStatus(userId)).toBe("degraded");
  });
});
