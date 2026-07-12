import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();
  const mockTransaction = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();
  const mockSet = vi.fn();
  const mockReturning = vi.fn();
  const sendPaymentReceiptEmail = vi.fn().mockResolvedValue(undefined);

  return {
    mockSelect,
    mockUpdate,
    mockTransaction,
    mockFrom,
    mockWhere,
    mockLimit,
    mockSet,
    mockReturning,
    sendPaymentReceiptEmail,
  };
});

vi.mock("@line/db", () => ({
  db: {
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
    transaction: mocks.mockTransaction,
  },
  payments: {
    id: "payments.id",
    userId: "payments.userId",
    status: "payments.status",
    plan: "payments.plan",
    amount: "payments.amount",
  },
  subscriptions: {
    userId: "subscriptions.userId",
    plan: "subscriptions.plan",
    status: "subscriptions.status",
    currentPeriodEnd: "subscriptions.currentPeriodEnd",
    updatedAt: "subscriptions.updatedAt",
  },
  user: {
    id: "user.id",
    email: "user.email",
    name: "user.name",
    locale: "user.locale",
  },
}));

vi.mock("@/lib/notifications", () => ({
  sendPaymentReceiptEmail: mocks.sendPaymentReceiptEmail,
}));

import { confirmPayment } from "@/lib/billing/fulfillment";

function chain(rows: unknown[]) {
  return {
    from: mocks.mockFrom.mockReturnValue({
      where: mocks.mockWhere.mockReturnValue({
        limit: mocks.mockLimit.mockResolvedValue(rows),
      }),
    }),
  };
}

describe("confirmPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockSelect.mockImplementation(() => chain([]));
    mocks.mockReturning.mockResolvedValue([{ id: "pay-1" }]);
    mocks.mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          update: mocks.mockUpdate.mockReturnValue({
            set: mocks.mockSet.mockReturnValue({
              where: mocks.mockWhere.mockReturnValue({
                returning: mocks.mockReturning,
              }),
            }),
          }),
        };
        return fn(tx);
      },
    );
  });

  it("returns not_found when payment is missing", async () => {
    mocks.mockSelect.mockImplementation(() => chain([]));
    const result = await confirmPayment("00000000-0000-0000-0000-000000000000");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("returns forbidden when userId does not match", async () => {
    mocks.mockSelect.mockImplementation(() =>
      chain([
        {
          id: "pay-1",
          userId: "user-a",
          status: "pending",
          plan: "starter",
          amount: 19900,
        },
      ]),
    );

    const result = await confirmPayment("pay-1", "user-b");
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("is idempotent when payment is already paid", async () => {
    mocks.mockSelect.mockImplementation(() =>
      chain([
        {
          id: "pay-1",
          userId: "user-a",
          status: "paid",
          plan: "starter",
          amount: 19900,
        },
      ]),
    );

    const result = await confirmPayment("pay-1", "user-a");
    expect(result).toEqual({ ok: true });
    expect(mocks.mockTransaction).not.toHaveBeenCalled();
  });

  it("marks payment paid and sends receipt email", async () => {
    mocks.mockSelect
      .mockImplementationOnce(() =>
        chain([
          {
            id: "pay-1",
            userId: "user-a",
            status: "pending",
            plan: "starter",
            amount: 19900,
          },
        ]),
      )
      .mockImplementationOnce(() =>
        chain([
          {
            email: "user@example.com",
            name: "User",
            locale: "en",
          },
        ]),
      );

    const result = await confirmPayment("pay-1");
    expect(result).toEqual({ ok: true });
    expect(mocks.mockTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.sendPaymentReceiptEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        plan: "starter",
        amountSatang: 19900,
      }),
    );
  });
});
