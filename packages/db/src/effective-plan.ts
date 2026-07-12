import { eq } from "drizzle-orm";

import {
  resolveEffectivePlan,
  type Plan,
  type PlanId,
} from "@line/shared/plan";

import { db } from "./client";
import { subscriptions } from "./schema";

export async function getEffectivePlanForUser(userId: string): Promise<Plan> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!sub) return resolveEffectivePlan(null);

  return resolveEffectivePlan({
    plan: sub.plan as PlanId,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
  });
}
