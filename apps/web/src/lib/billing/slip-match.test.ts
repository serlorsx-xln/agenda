import { describe, expect, it, vi } from "vitest";

vi.mock("@line/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  },
  slipClaims: { tran: "tran" },
}));

vi.mock("@/lib/billing/slip-receiver", () => ({
  shopReceiverIdentifiers: () => ["0812345678", "812345678"],
  receiverMatchesShop: (raw: string) =>
    raw.replace(/\D/g, "").endsWith("5678"),
  slipReceiverDisplayLabel: () => "081-234-5678",
}));

import { matchSlipToPayment } from "@/lib/billing/slip-match";
import type { Payment } from "@line/db";

const payment = {
  id: "pay-1",
  userId: "user-1",
  amount: 19900,
  status: "pending",
} as Payment;

describe("matchSlipToPayment", () => {
  it("accepts a matching slip", async () => {
    const result = await matchSlipToPayment(
      {
        RETURN_CODE: "0000",
        STATUS: "FOUND",
        TRAN: "TXN123",
        SLIP_DATA: {
          TXN_INFO: { TXN_AMT: 199 },
          RECEIVER_INFO: { ACCT_NUM: "xxx-xxx-5678" },
          REF_ID: "REF1",
        },
      },
      payment,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tran).toBe("TXN123");
  });

  it("rejects amount mismatch", async () => {
    const result = await matchSlipToPayment(
      {
        RETURN_CODE: "0000",
        STATUS: "FOUND",
        TRAN: "TXN999",
        SLIP_DATA: {
          TXN_INFO: { TXN_AMT: 100 },
          RECEIVER_INFO: { ACCT_NUM: "0812345678" },
        },
      },
      payment,
    );
    expect(result).toMatchObject({ ok: false, reason: "amount_mismatch" });
  });

  it("rejects not found slips", async () => {
    const result = await matchSlipToPayment(
      { RETURN_CODE: "0001", STATUS: "NOT_FOUND" },
      payment,
    );
    expect(result).toMatchObject({ ok: false, reason: "not_found" });
  });
});
