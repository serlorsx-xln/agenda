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

  it("matches Mae Manee biller and tax id variants", () => {
    vi.stubEnv("PROMPTPAY_ID", "010753700088205");
    vi.stubEnv("PROMPTPAY_MERCHANT_NAME", "SLYNX");
    vi.stubEnv("SLIP_RECEIVER_ACCOUNT", "");
    expect(shopReceiverIdentifiers()).toContain("010753700088205");
    expect(shopReceiverIdentifiers()).toContain("0753700088205");
    expect(receiverMatchesShop("010753700088205")).toBe(true);
    expect(receiverMatchesShop("0753700088205")).toBe(true);
    expect(receiverMatchesShop("xxx-xxx-8205")).toBe(true);
  });
});
