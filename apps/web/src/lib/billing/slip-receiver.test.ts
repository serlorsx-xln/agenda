import { afterEach, describe, expect, it, vi } from "vitest";

import {
  receiverMatchesShop,
  shopReceiverIdentifiers,
} from "@/lib/billing/slip-receiver";

describe("slip-receiver", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("matches phone variants and masked receivers", () => {
    vi.stubEnv("PROMPTPAY_ID", "0812345678");
    expect(shopReceiverIdentifiers()).toContain("0812345678");
    expect(shopReceiverIdentifiers()).toContain("812345678");
    expect(receiverMatchesShop("0812345678")).toBe(true);
    expect(receiverMatchesShop("xxx-xxx-5678")).toBe(true);
    expect(receiverMatchesShop("0999999999")).toBe(false);
  });
});
