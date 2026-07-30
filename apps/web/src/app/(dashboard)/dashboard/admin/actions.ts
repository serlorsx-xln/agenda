"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, subscriptions, user as userTable } from "@line/db";

import { recordAudit } from "@/lib/audit";
import { confirmPayment } from "@/lib/billing/fulfillment";
import { ensureUserResources } from "@/lib/db-helpers";
import { getPlan, type PlanId } from "@/lib/plans";
import { requireAdmin } from "@/lib/session";

type StoredPlanId = "free" | "starter" | "growth" | "pro";

export type ActionResult = { ok: boolean; error?: string };

export async function confirmPaymentAdmin(
  paymentId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = z.string().uuid().safeParse(paymentId);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const result = await confirmPayment(parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  await recordAudit(admin.id, "admin.payment.confirm", {
    targetType: "payment",
    targetId: parsed.data,
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/billing");
  return { ok: true };
}

/** Ops: delete every non-admin user and cascaded data. Admin accounts are kept. */
export async function resetNonAdminUsersAdmin(): Promise<
  ActionResult & { deletedCount?: number }
> {
  const admin = await requireAdmin();
  const { resetNonAdminUsers } = await import("@line/db/reset-non-admin");
  const result = await resetNonAdminUsers();

  await recordAudit(admin.id, "admin.reset_non_admin_users", {
    metadata: {
      deletedCount: result.deletedCount,
      deletedEmails: result.deleted.map((row) => row.email),
      remainingEmails: result.remaining.map((row) => row.email),
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  return { ok: true, deletedCount: result.deletedCount };
}

export async function banUser(
  userId: string,
  reason?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false, error: "self" };

  await db
    .update(userTable)
    .set({
      banned: true,
      banReason: reason?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, userId));

  await recordAudit(admin.id, "admin.user.ban", {
    targetType: "user",
    targetId: userId,
    metadata: reason ? { reason } : undefined,
  });

  revalidatePath("/dashboard/admin");
  return { ok: true };
}

export async function unbanUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  await db
    .update(userTable)
    .set({
      banned: false,
      banReason: null,
      banExpires: null,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, userId));

  await recordAudit(admin.id, "admin.user.unban", {
    targetType: "user",
    targetId: userId,
  });

  revalidatePath("/dashboard/admin");
  return { ok: true };
}

export async function setUserPlan(
  userId: string,
  planId: PlanId,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const plan = getPlan(planId);
  if (!plan || planId === "locked") return { ok: false, error: "invalid_plan" };

  await ensureUserResources(userId);

  const now = new Date();
  const storedPlan = planId as StoredPlanId;
  const periodEnd =
    storedPlan === "free" ? null : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db
    .update(subscriptions)
    .set({
      plan: storedPlan,
      status: "active",
      currentPeriodEnd: periodEnd,
      // Paid plans must not keep showing trial UI/limits.
      ...(storedPlan !== "free"
        ? { trialStartedAt: null, trialEndsAt: null }
        : {}),
      updatedAt: now,
    })
    .where(eq(subscriptions.userId, userId));

  await recordAudit(admin.id, "admin.subscription.set_plan", {
    targetType: "user",
    targetId: userId,
    metadata: { plan: planId },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard");
  return { ok: true };
}
