import { and, eq, sql } from "drizzle-orm";

import {
  db,
  campaignDailySends,
  campaignRunEvents,
  campaignRuns,
  campaignTargets,
  campaigns,
  lineChats,
  lineConnection,
  subscriptions,
  templates,
  user as userTable,
  type Campaign,
} from "@line/db";
import { resolveImageAssetIds } from "@line/shared/image-assets";
import { capMaxSends, hasPlanFeature } from "@line/shared/plan-features";
import {
  isPlanLocked,
  isTrialActive,
  resolveEffectivePlan,
} from "@line/shared/plan";

import { lineManager } from "../line/manager.js";
import { log } from "../logger.js";
import {
  accountCooldownRemainingSec,
  backoffSecondsForStreak,
  computeDelaySec,
  computeNextSendAt,
  isRateLimitError,
  isWithinWindow,
  nextRotationIndex,
  pickEligibleTargetIndex,
  pickNextCampaign,
  remainingWindowSec,
  rotationIndexAt,
  shouldReuseDailyRun,
  statDateInTz,
} from "./send-queue-utils.js";
import {
  clearRunCancellation,
  isRunCancelled,
} from "./run-cancellation.js";

const usersInFlight = new Set<string>();

export type SendResult = {
  ok: boolean;
  runId?: string;
  reason?: string;
  sent?: boolean;
};

type TargetRow = {
  chatMid: string;
  name: string | null;
  lastSentAt: Date | null;
};

async function getDailySendTotal(
  campaignId: string,
  statDate: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${campaignDailySends.sendCount}), 0)::int`,
    })
    .from(campaignDailySends)
    .where(
      and(
        eq(campaignDailySends.campaignId, campaignId),
        eq(campaignDailySends.statDate, statDate),
      ),
    );
  return row?.total ?? 0;
}

async function incrementDailySend(
  campaignId: string,
  statDate: string,
  chatMid: string,
): Promise<void> {
  await db
    .insert(campaignDailySends)
    .values({
      campaignId,
      statDate,
      chatMid,
      sendCount: 1,
    })
    .onConflictDoUpdate({
      target: [
        campaignDailySends.campaignId,
        campaignDailySends.statDate,
        campaignDailySends.chatMid,
      ],
      set: {
        sendCount: sql`${campaignDailySends.sendCount} + 1`,
      },
    });
}

async function logEvent(
  runId: string,
  status: "success" | "failed" | "skipped" | "info",
  message: string,
  chat?: { chatMid: string; chatName: string },
): Promise<void> {
  try {
    await db.insert(campaignRunEvents).values({
      runId,
      status,
      message,
      chatMid: chat?.chatMid,
      chatName: chat?.chatName,
    });
  } catch (err) {
    log("warn", "failed to write campaign run event", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function loadTargets(campaign: Campaign): Promise<TargetRow[]> {
  return db
    .select({
      chatMid: campaignTargets.chatMid,
      name: lineChats.name,
      lastSentAt: campaignTargets.lastSentAt,
    })
    .from(campaignTargets)
    .innerJoin(
      lineChats,
      and(
        eq(lineChats.userId, campaign.userId),
        eq(lineChats.chatMid, campaignTargets.chatMid),
        eq(lineChats.present, true),
      ),
    )
    .where(
      and(
        eq(campaignTargets.campaignId, campaign.id),
        eq(campaignTargets.enabled, true),
      ),
    )
    .orderBy(campaignTargets.chatMid);
}

async function getLastCampaignSendAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ lastCampaignSendAt: lineConnection.lastCampaignSendAt })
    .from(lineConnection)
    .where(eq(lineConnection.userId, userId))
    .limit(1);
  return row?.lastCampaignSendAt ?? null;
}

async function markCampaignSendTimestamps(
  userId: string,
  campaignId: string,
  chatMid: string,
  at: Date,
): Promise<void> {
  await Promise.all([
    db
      .update(campaignTargets)
      .set({ lastSentAt: at })
      .where(
        and(
          eq(campaignTargets.campaignId, campaignId),
          eq(campaignTargets.chatMid, chatMid),
        ),
      ),
    db
      .update(lineConnection)
      .set({ lastCampaignSendAt: at, updatedAt: at })
      .where(eq(lineConnection.userId, userId)),
  ]);
}

async function resolveTemplate(campaign: Campaign): Promise<{
  body: string;
  imageAssetIds: string[];
}> {
  if (!campaign.templateId) return { body: "", imageAssetIds: [] };
  const [tpl] = await db
    .select({
      body: templates.body,
      imageAssetIds: templates.imageAssetIds,
    })
    .from(templates)
    .where(eq(templates.id, campaign.templateId))
    .limit(1);
  return {
    body: tpl?.body ?? "",
    imageAssetIds: resolveImageAssetIds(tpl?.imageAssetIds),
  };
}

async function getOrCreateDailyRun(
  campaign: Campaign,
  trigger: "scheduled" | "manual",
): Promise<string> {
  const now = new Date();
  if (campaign.dailyRunId) {
    const [existing] = await db
      .select({
        id: campaignRuns.id,
        createdAt: campaignRuns.createdAt,
        status: campaignRuns.status,
      })
      .from(campaignRuns)
      .where(eq(campaignRuns.id, campaign.dailyRunId))
      .limit(1);
    if (
      existing &&
      shouldReuseDailyRun(new Date(existing.createdAt), now, campaign.timezone)
    ) {
      if (existing.status !== "running") {
        await db
          .update(campaignRuns)
          .set({ status: "running", finishedAt: null })
          .where(eq(campaignRuns.id, existing.id));
      }
      return existing.id;
    }
  }

  const targets = await loadTargets(campaign);
  const [runRow] = await db
    .insert(campaignRuns)
    .values({
      userId: campaign.userId,
      campaignId: campaign.id,
      status: "running",
      trigger,
      totalTargets: targets.length,
      startedAt: now,
    })
    .returning({ id: campaignRuns.id });

  await db
    .update(campaigns)
    .set({ dailyRunId: runRow!.id, updatedAt: now })
    .where(eq(campaigns.id, campaign.id));

  return runRow!.id;
}

async function assertCanSend(
  campaign: Campaign,
  targetCount: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [[sub], [userRow]] = await Promise.all([
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, campaign.userId))
      .limit(1),
    db
      .select({ banned: userTable.banned })
      .from(userTable)
      .where(eq(userTable.id, campaign.userId))
      .limit(1),
  ]);

  if (userRow?.banned) return { ok: false, reason: "User is banned" };

  const snapshot = sub
    ? {
        plan: sub.plan,
        status: sub.status,
        trialEndsAt: sub.trialEndsAt,
      }
    : null;

  const plan = resolveEffectivePlan(snapshot);
  if (isPlanLocked(plan)) return { ok: false, reason: "Subscription required" };
  if (targetCount > plan.maxTargetsPerCampaign) {
    return { ok: false, reason: "Plan destination limit exceeded" };
  }
  if (
    campaign.cronExpr?.trim() &&
    !hasPlanFeature(plan, "schedulingCron")
  ) {
    return { ok: false, reason: "Plan does not include scheduled sending" };
  }
  if (
    sub &&
    sub.plan !== "free" &&
    sub.status !== "active" &&
    !isTrialActive(snapshot)
  ) {
    return { ok: false, reason: "Subscription inactive" };
  }
  return { ok: true };
}

async function clearNextSend(campaignId: string): Promise<void> {
  await db
    .update(campaigns)
    .set({ nextSendAt: null, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
}

async function pauseCampaignForRateLimit(campaignId: string): Promise<void> {
  await db
    .update(campaigns)
    .set({
      enabled: false,
      status: "paused",
      nextSendAt: null,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));
}

export async function sendNextInRotation(
  campaign: Campaign,
  trigger: "scheduled" | "manual",
): Promise<SendResult> {
  if (!campaign.enabled && trigger === "scheduled") {
    return { ok: false, reason: "Campaign disabled", sent: false };
  }

  if (!isWithinWindow(campaign)) {
    await clearNextSend(campaign.id);
    return { ok: false, reason: "Outside sending window", sent: false };
  }

  const targets = await loadTargets(campaign);
  if (targets.length === 0) {
    await clearNextSend(campaign.id);
    return { ok: false, reason: "No targets", sent: false };
  }

  if (campaign.dailyRunId && isRunCancelled(campaign.dailyRunId)) {
    await clearNextSend(campaign.id);
    return { ok: false, reason: "Run cancelled", sent: false };
  }

  const planCheck = await assertCanSend(campaign, targets.length);
  if (!planCheck.ok) {
    return { ok: false, reason: planCheck.reason, sent: false };
  }

  if (!campaign.templateId) {
    return { ok: false, reason: "No template", sent: false };
  }

  const { body, imageAssetIds } = await resolveTemplate(campaign);
  if (!body.trim() && imageAssetIds.length === 0) {
    return { ok: false, reason: "No template content", sent: false };
  }

  const [subRow] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, campaign.userId))
    .limit(1);
  const effectivePlan = resolveEffectivePlan(
    subRow
      ? {
          plan: subRow.plan,
          status: subRow.status,
          trialEndsAt: subRow.trialEndsAt,
        }
      : null,
  );
  const dailyCap = capMaxSends(effectivePlan, campaign.maxSends);
  const statDate = statDateInTz(campaign.timezone);
  const sentToday = await getDailySendTotal(campaign.id, statDate);

  if (sentToday >= dailyCap) {
    await clearNextSend(campaign.id);
    return { ok: false, reason: "Daily send limit reached", sent: false };
  }

  const now = new Date();
  const accountRemaining = accountCooldownRemainingSec(
    await getLastCampaignSendAt(campaign.userId),
    now,
  );
  if (accountRemaining > 0) {
    const nextAt = new Date(now.getTime() + accountRemaining * 1000);
    await db
      .update(campaigns)
      .set({ nextSendAt: nextAt, updatedAt: now })
      .where(eq(campaigns.id, campaign.id));
    return { ok: false, reason: "Account send cooldown", sent: false };
  }

  const rotationIndex = rotationIndexAt(
    campaign.sendRotationIndex ?? 0,
    targets.length,
  );
  const perChatCooldown =
    campaign.perChatCooldownSec ?? 1800;
  const pick = pickEligibleTargetIndex(
    targets,
    rotationIndex,
    perChatCooldown,
    now,
  );
  if (!pick.ok) {
    await db
      .update(campaigns)
      .set({ nextSendAt: pick.earliestReadyAt, updatedAt: now })
      .where(eq(campaigns.id, campaign.id));
    return { ok: false, reason: "All chats in cooldown", sent: false };
  }

  const target = targets[pick.index]!;
  const sendIndex = pick.index;

  const client = await lineManager.getReadyClient(campaign.userId);
  if (!client) {
    return { ok: false, reason: "LINE session not ready", sent: false };
  }

  if (target.chatMid.startsWith("c")) {
    const e2eeCheck = await lineManager.validateE2EEForUser(campaign.userId);
    if (!e2eeCheck.valid) {
      return {
        ok: false,
        reason: `E2EE keys invalid: ${e2eeCheck.reason ?? "unknown"}`,
        sent: false,
      };
    }
  }

  const runId = await getOrCreateDailyRun(campaign, trigger);

  if (isRunCancelled(runId)) {
    await clearNextSend(campaign.id);
    return { ok: false, reason: "Run cancelled", sent: false };
  }

  try {
    await lineManager.sendTemplateContent(campaign.userId, target.chatMid, {
      text: body,
      imageAssetIds,
    });

    await incrementDailySend(campaign.id, statDate, target.chatMid);
    await markCampaignSendTimestamps(
      campaign.userId,
      campaign.id,
      target.chatMid,
      now,
    );

    const [run] = await db
      .select({ sentCount: campaignRuns.sentCount })
      .from(campaignRuns)
      .where(eq(campaignRuns.id, runId))
      .limit(1);
    const newSent = (run?.sentCount ?? 0) + 1;

    await db
      .update(campaignRuns)
      .set({
        sentCount: newSent,
        status: "running",
        finishedAt: null,
      })
      .where(eq(campaignRuns.id, runId));

    if (body.trim()) {
      await logEvent(runId, "success", "Text message sent", {
        chatMid: target.chatMid,
        chatName: target.name ?? "Chat",
      });
    }
    if (imageAssetIds.length > 0) {
      await logEvent(
        runId,
        "success",
        imageAssetIds.length > 1
          ? `${imageAssetIds.length} images sent (grid)`
          : "Image message sent",
        { chatMid: target.chatMid, chatName: target.name ?? "Chat" },
      );
    }
    await logEvent(runId, "success", "Delivered to target", {
      chatMid: target.chatMid,
      chatName: target.name ?? "Chat",
    });

    const nextRotation = nextRotationIndex(sendIndex, targets.length);
    const remainingSends = dailyCap - sentToday - 1;
    const windowSec = remainingWindowSec(campaign, now);
    const delaySec = computeDelaySec(
      campaign.delayBetweenTargetsSec,
      campaign.randomJitterSec,
      remainingSends,
      windowSec,
    );

    if (remainingSends <= 0) {
      await db
        .update(campaigns)
        .set({
          sendRotationIndex: nextRotation,
          rateLimitStreak: 0,
          lastRunAt: now,
          nextSendAt: null,
          updatedAt: now,
        })
        .where(eq(campaigns.id, campaign.id));
      await db
        .update(campaignRuns)
        .set({ status: "success", finishedAt: now })
        .where(eq(campaignRuns.id, runId));
      clearRunCancellation(runId);
    } else {
      const updatedTargets = targets.map((t, i) =>
        i === sendIndex ? { ...t, lastSentAt: now } : t,
      );
      const nextPickFromNow = pickEligibleTargetIndex(
        updatedTargets,
        nextRotation,
        perChatCooldown,
        now,
      );
      const earliestChatReady = nextPickFromNow.ok
        ? null
        : nextPickFromNow.earliestReadyAt;
      const nextAt = computeNextSendAt(now, delaySec, earliestChatReady);
      await db
        .update(campaigns)
        .set({
          sendRotationIndex: nextRotation,
          rateLimitStreak: 0,
          lastRunAt: now,
          nextSendAt: nextAt,
          updatedAt: now,
        })
        .where(eq(campaigns.id, campaign.id));
    }

    return { ok: true, runId, sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEvent(runId, "failed", message, {
      chatMid: target.chatMid,
      chatName: target.name ?? "Chat",
    });

    const [run] = await db
      .select({ failedCount: campaignRuns.failedCount })
      .from(campaignRuns)
      .where(eq(campaignRuns.id, runId))
      .limit(1);
    const newFailed = (run?.failedCount ?? 0) + 1;
    await db
      .update(campaignRuns)
      .set({ failedCount: newFailed })
      .where(eq(campaignRuns.id, runId));

    if (isRateLimitError(err)) {
      const streak = (campaign.rateLimitStreak ?? 0) + 1;
      const backoffSec = backoffSecondsForStreak(streak);
      if (streak >= 3) {
        await pauseCampaignForRateLimit(campaign.id);
        await logEvent(
          runId,
          "info",
          "Campaign paused after repeated rate limits",
        );
        return { ok: false, reason: "rate_limited_paused", sent: false };
      }
      await db
        .update(campaigns)
        .set({
          rateLimitStreak: streak,
          nextSendAt: new Date(Date.now() + backoffSec * 1000),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id));
      return { ok: false, reason: "rate_limited", sent: false };
    }

    const nextRotation = nextRotationIndex(sendIndex, targets.length);
    if (newFailed >= campaign.autoStopOnErrors) {
      await db
        .update(campaigns)
        .set({
          enabled: false,
          status: "paused",
          sendRotationIndex: nextRotation,
          nextSendAt: null,
          lastRunAt: now,
          updatedAt: now,
        })
        .where(eq(campaigns.id, campaign.id));
      await logEvent(
        runId,
        "info",
        `Campaign paused after ${newFailed} consecutive errors`,
      );
      await db
        .update(campaignRuns)
        .set({ status: "failed", finishedAt: now })
        .where(eq(campaignRuns.id, runId));
      clearRunCancellation(runId);
      return { ok: false, reason: message, sent: false };
    }

    await db
      .update(campaigns)
      .set({
        sendRotationIndex: nextRotation,
        lastRunAt: now,
        updatedAt: now,
      })
      .where(eq(campaigns.id, campaign.id));

    return { ok: false, reason: message, sent: false };
  }
}

export async function seedCampaignQueues(enabled: Campaign[]): Promise<void> {
  const now = new Date();
  for (const c of enabled) {
    if (!isWithinWindow(c)) continue;
    const statDate = statDateInTz(c.timezone, now);
    const [subRow] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, c.userId))
      .limit(1);
    const plan = resolveEffectivePlan(
      subRow
        ? {
            plan: subRow.plan,
            status: subRow.status,
            trialEndsAt: subRow.trialEndsAt,
          }
        : null,
    );
    if (isPlanLocked(plan)) continue;

    const dailyCap = capMaxSends(plan, c.maxSends);
    const sentToday = await getDailySendTotal(c.id, statDate);
    if (sentToday >= dailyCap) continue;

    if (c.nextSendAt == null) {
      await db
        .update(campaigns)
        .set({ nextSendAt: now, updatedAt: now })
        .where(eq(campaigns.id, c.id));
    }
  }
}

export async function processDueSends(): Promise<void> {
  const now = new Date();
  const enabled = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.enabled, true));

  const due = enabled.filter((c) => {
    if (!isWithinWindow(c)) return false;
    if (c.nextSendAt == null) return false;
    return c.nextSendAt.getTime() <= now.getTime();
  });

  const byUser = new Map<string, Campaign[]>();
  for (const c of due) {
    const list = byUser.get(c.userId) ?? [];
    list.push(c);
    byUser.set(c.userId, list);
  }

  for (const [userId, list] of byUser) {
    if (usersInFlight.has(userId)) continue;
    const picked = pickNextCampaign(list);
    if (!picked) continue;

    usersInFlight.add(userId);
    try {
      const [fresh] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, picked.id))
        .limit(1);
      if (fresh?.enabled) {
        if (fresh.dailyRunId && isRunCancelled(fresh.dailyRunId)) {
          await clearNextSend(fresh.id);
          continue;
        }
        await sendNextInRotation(fresh, "scheduled");
      }
    } catch (err) {
      log("warn", "processDueSends failed", {
        userId,
        campaignId: picked.id,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      usersInFlight.delete(userId);
    }
  }
}

export function anyUserSendInFlight(): boolean {
  return usersInFlight.size > 0;
}

export async function runCampaignManual(
  campaign: Campaign,
): Promise<SendResult> {
  if (usersInFlight.has(campaign.userId)) {
    return { ok: false, reason: "Send already in progress", sent: false };
  }
  usersInFlight.add(campaign.userId);
  try {
    return await sendNextInRotation(campaign, "manual");
  } finally {
    usersInFlight.delete(campaign.userId);
  }
}

export async function enqueueCronSend(campaign: Campaign): Promise<void> {
  if (!isWithinWindow(campaign)) return;
  await db
    .update(campaigns)
    .set({ nextSendAt: new Date(), updatedAt: new Date() })
    .where(eq(campaigns.id, campaign.id));
}
