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

  it("preserves Mae Manee QN ref and original tag 62 with amount", () => {
    const payload = buildBillPaymentPayload({
      billerId: "010753700088205",
      amountBaht: 79,
      ref1: "QN122990MB11420395G",
      ref2: "SLYNX",
      additionalData: "07200000MgVlF7VzCJoONVp9",
      pointOfInitiation: "11",
    });

    expect(payload.startsWith("000201010211")).toBe(true);
    expect(payload).toContain("A000000677010112");
    expect(payload).toContain("010753700088205");
    expect(payload).toContain("QN122990MB11420395G");
    expect(payload).toContain("SLYNX");
    expect(payload).toContain("540579.00");
    expect(payload).toContain("07200000MgVlF7VzCJoONVp9");
    expect(payload.slice(-4)).toBe(emvCrc16(payload.slice(0, -4)));
  });

  it("matches CRC of the merchant's original static QR", () => {
    const original =
      "00020101021130710016A00000067701011201150107537000882050219QN122990MB11420395G0305SLYNX53037645802TH622407200000MgVlF7VzCJoONVp963047086";
    expect(emvCrc16(original.slice(0, -4))).toBe(original.slice(-4));
  });

  it("sanitizes refs but keeps QN ids", () => {
    expect(sanitizeBillRef("QN122990MB11420395G")).toBe("QN122990MB11420395G");
    expect(sanitizeBillRef("PP-abc_12!")).toBe("PPABC12");
  });
});
