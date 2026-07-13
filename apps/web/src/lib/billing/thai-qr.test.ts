import { describe, expect, it } from "vitest";

import {
  buildBillPaymentPayload,
  emvCrc16,
  emvTlv,
  sanitizeBillRef,
  toBillerId,
} from "@/lib/billing/thai-qr";

describe("thai-qr", () => {
  it("builds TLV and CRC", () => {
    expect(emvTlv("00", "01")).toBe("000201");
    expect(emvCrc16("000201").length).toBe(4);
  });

  it("normalizes biller id", () => {
    expect(toBillerId("0753700088205")).toBe("010753700088205");
    expect(toBillerId("010753700088205")).toBe("010753700088205");
  });

  it("builds dynamic bill payment QR with amount and slynx ref", () => {
    const payload = buildBillPaymentPayload({
      billerId: "010753700088205",
      amountBaht: 79,
      ref1: "PP-TEST-1",
      ref2: "SLYNX",
    });

    expect(payload.startsWith("000201010212")).toBe(true);
    expect(payload).toContain("A000000677010112");
    expect(payload).toContain("010753700088205");
    expect(payload).toContain("540579.00");
    expect(payload).toContain("SLYNX");
    expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/);

    // CRC must validate: recompute over payload without last 4, with 6304
    const body = payload.slice(0, -4);
    expect(body.endsWith("6304")).toBe(true);
    expect(payload.slice(-4)).toBe(emvCrc16(body));
  });

  it("sanitizes refs", () => {
    expect(sanitizeBillRef("PP-abc_12!")).toBe("PPABC12");
  });
});
