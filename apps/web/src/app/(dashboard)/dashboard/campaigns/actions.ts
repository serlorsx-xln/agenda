"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, campaignTargets, campaigns, templates } from "@line/db";
import {
  MIN_ACCOUNT_SEND_DELAY_SEC,
  MIN_PER_CHAT_COOLDOWN_SEC,
} from "@line/shared";

import { recordAudit } from "@/lib/audit";
import {
  isAllowedCronExpr,
  normalizeCronExpr,
} from "@/lib/campaign-schedule";
import {
  assertCanAddTarget,
  assertCanCreateCampaign,
  assertCanSetTargetCount,
  assertNotLocked,
  validateCampaignPlanInput,
} from "@/lib/plan-limits";
import { getEffectivePlan } from "@/lib/subscription-trial";
import { requireUser } from "@/lib/session";
import { workerFetch } from "@/lib/worker";

export type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
  dailyRunId?: string | null;
};

const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  templateId: z.string().uuid(),
  timezone: z.string().min(1).default("Asia/Bangkok"),
  windowStartHour: z.number().int().min(0).max(23),
  windowEndHour: z.number().int().min(0).max(23),
  cronExpr: z
    .string()
    .max(120)
    .nullable()
    .optional()
    .refine((v) => isAllowedCronExpr(v), { message: "invalid_schedule" }),
  maxSends: z.number().int().min(1).max(1000),
  delayBetweenTargetsSec: z
    .number()
    .int()
    .min(MIN_ACCOUNT_SEND_DELAY_SEC)
    .max(7200),
  perChatCooldownSec: z
    .number()
    .int()
    .min(MIN_PER_CHAT_COOLDOWN_SEC)
    .max(86400),
  randomJitterSec: z.number().int().min(0).max(3600),
  autoStopOnErrors: z.number().int().min(1).max(50),
  enabled: z.boolean(),
});

async function assertOwnership(userId: string, campaignId: string) {
  const [row] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
    .limit(1);
  return !!row;
}

async function assertOwnsTemplate(
  userId: string,
  templateId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function createCampaign(
  input: z.input<typeof campaignSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const limit = await assertCanCreateCampaign(user.id);
  if (!limit.ok) return limit;

  const d = parsed.data;
  if (!(await assertOwnsTemplate(user.id, d.templateId))) {
    return { ok: false, error: "template_required" };
  }
  const cronExpr = normalizeCronExpr(d.cronExpr);
  const plan = await getEffectivePlan(user.id);
  const planCheck = validateCampaignPlanInput(plan, {
    cronExpr,
    maxSends: d.maxSends,
  });
  if (!planCheck.ok) return { ok: false, error: planCheck.error };

  const [row] = await db
    .insert(campaigns)
    .values({
      userId: user.id,
      name: d.name,
      templateId: d.templateId,
      timezone: d.timezone,
      windowStartHour: d.windowStartHour,
      windowEndHour: d.windowEndHour,
      cronExpr,
      maxSends: planCheck.maxSends,
      delayBetweenTargetsSec: d.delayBetweenTargetsSec,
      perChatCooldownSec: d.perChatCooldownSec,
      randomJitterSec: d.randomJitterSec,
      autoStopOnErrors: d.autoStopOnErrors,
      enabled: d.enabled,
      status: d.enabled ? "active" : "draft",
    })
    .returning({ id: campaigns.id });

  await recordAudit(user.id, "campaign.create", {
    targetType: "campaign",
    targetId: row?.id,
  });
  revalidatePath("/dashboard/campaigns");
  return { ok: true, id: row?.id };
}

export async function updateCampaign(
  id: string,
  input: z.input<typeof campaignSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await assertOwnership(user.id, id)))
    return { ok: false, error: "forbidden" };
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  if (!(await assertOwnsTemplate(user.id, d.templateId))) {
    return { ok: false, error: "template_required" };
  }
  const cronExpr = normalizeCronExpr(d.cronExpr);
  const plan = await getEffectivePlan(user.id);
  const planCheck = validateCampaignPlanInput(plan, {
    cronExpr,
    maxSends: d.maxSends,
  });
  if (!planCheck.ok) return { ok: false, error: planCheck.error };

  await db
    .update(campaigns)
    .set({
      name: d.name,
      templateId: d.templateId,
      timezone: d.timezone,
      windowStartHour: d.windowStartHour,
      windowEndHour: d.windowEndHour,
      cronExpr,
      maxSends: planCheck.maxSends,
      delayBetweenTargetsSec: d.delayBetweenTargetsSec,
      perChatCooldownSec: d.perChatCooldownSec,
      randomJitterSec: d.randomJitterSec,
      autoStopOnErrors: d.autoStopOnErrors,
      enabled: d.enabled,
      status: d.enabled ? "active" : "paused",
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, user.id)));

  await recordAudit(user.id, "campaign.update", {
    targetType: "campaign",
    targetId: id,
  });
  revalidatePath("/dashboard/campaigns");
  return { ok: true, id };
}

export async function setCampaignTargets(
  campaignId: string,
  chatMids: string[],
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await assertOwnership(user.id, campaignId)))
    return { ok: false, error: "forbidden" };

  const limit = await assertCanSetTargetCount(user.id, chatMids.length);
  if (!limit.ok) return limit;

  await db
    .delete(campaignTargets)
    .where(eq(campaignTargets.campaignId, campaignId));

  if (chatMids.length > 0) {
    await db.insert(campaignTargets).values(
      chatMids.map((chatMid) => ({
        userId: user.id,
        campaignId,
        chatMid,
        enabled: true,
      })),
    );
  }

  revalidatePath("/dashboard/campaigns");
  return { ok: true };
}

export async function addTargetToCampaign(
  campaignId: string,
  chatMid: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await assertOwnership(user.id, campaignId)))
    return { ok: false, error: "forbidden" };

  const limit = await assertCanAddTarget(user.id, campaignId);
  if (!limit.ok) return limit;

  await db
    .insert(campaignTargets)
    .values({ userId: user.id, campaignId, chatMid, enabled: true })
    .onConflictDoNothing({
      target: [campaignTargets.campaignId, campaignTargets.chatMid],
    });

  revalidatePath("/dashboard/campaigns");
  return { ok: true };
}

export async function setCampaignEnabled(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await assertOwnership(user.id, id)))
    return { ok: false, error: "forbidden" };

  await db
    .update(campaigns)
    .set({
      enabled,
      status: enabled ? "active" : "paused",
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, user.id)));

  revalidatePath("/dashboard/campaigns");
  return { ok: true };
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await db
    .delete(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, user.id)));
  await recordAudit(user.id, "campaign.delete", {
    targetType: "campaign",
    targetId: id,
  });
  revalidatePath("/dashboard/campaigns");
  return { ok: true };
}

export async function runCampaignNow(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await assertOwnership(user.id, id)))
    return { ok: false, error: "forbidden" };
  const gate = await assertNotLocked(user.id);
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    await workerFetch(`/campaigns/${id}/run`, { method: "POST" }, user.id);
    await recordAudit(user.id, "campaign.run", {
      targetType: "campaign",
      targetId: id,
    });
    const [row] = await db
      .select({ dailyRunId: campaigns.dailyRunId })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);
    revalidatePath("/dashboard/runs");
    revalidatePath("/dashboard/campaigns");
    return { ok: true, dailyRunId: row?.dailyRunId ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error" };
  }
}
