"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, lineChats, templates, autoReplyRules } from "@line/db";
import { validateMatchInput } from "@line/shared/auto-reply-match";
import { resolveImageAssetIds } from "@line/shared/image-assets";

import { recordAudit } from "@/lib/audit";
import { getConnection } from "@/lib/db-helpers";
import {
  assertCanCreateAutoReplyRule,
  validateAutoReplyPlanInput,
} from "@/lib/plan-limits";
import { getEffectivePlan } from "@/lib/subscription-trial";
import { requireUser } from "@/lib/session";
import { workerFetch } from "@/lib/worker";

const ruleSchema = z
  .object({
    chatMids: z.array(z.string().min(1)).min(1).max(50),
    includeKeywords: z.array(z.string().min(1).max(120)).min(1).max(20),
    excludeKeywords: z.array(z.string().min(1).max(120)).max(20).optional(),
    emojiFilter: z
      .enum(["any", "with_emoji", "without_emoji"])
      .optional(),
    replyText: z.string().max(4000).optional().nullable(),
    templateId: z.string().uuid().optional().nullable(),
    replyImageAssetIds: z.array(z.string().uuid()).max(10).optional(),
    matchMode: z.enum(["contains", "exact"]).optional(),
    enabled: z.boolean().optional(),
    cooldownSec: z.number().int().min(0).max(3600).optional(),
    priority: z.number().int().min(0).max(100).optional(),
  })
  .superRefine((data, ctx) => {
    const match = validateMatchInput({
      includeKeywords: data.includeKeywords,
      excludeKeywords: data.excludeKeywords ?? [],
      emojiFilter: data.emojiFilter ?? "any",
      matchMode: data.matchMode ?? "contains",
    });
    if (!match.ok) {
      ctx.addIssue({ code: "custom", message: match.error });
    }
  });

export type ActionResult = { ok: boolean; error?: string };

async function resolveTemplateHasImages(
  userId: string,
  templateId: string | null | undefined,
): Promise<boolean> {
  if (!templateId) return false;
  const [row] = await db
    .select({ imageAssetIds: templates.imageAssetIds })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .limit(1);
  return resolveImageAssetIds(row?.imageAssetIds).length > 0;
}

async function assertChatsOwned(userId: string, chatMids: string[]) {
  for (const chatMid of chatMids) {
    const [row] = await db
      .select({ id: lineChats.id })
      .from(lineChats)
      .where(and(eq(lineChats.userId, userId), eq(lineChats.chatMid, chatMid)))
      .limit(1);
    if (!row) throw new Error("chat_not_found");
  }
}

async function assertConnectedIfEnabled(userId: string, enabled?: boolean) {
  if (enabled === false) return;
  const conn = await getConnection(userId);
  if (conn?.status !== "connected") {
    throw new Error("line_not_connected");
  }
}

export async function createAutoReplyRule(
  input: z.infer<typeof ruleSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    return { ok: false, error: msg === "invalid" ? "invalid" : msg ?? "invalid" };
  }

  const limit = await assertCanCreateAutoReplyRule(user.id);
  if (!limit.ok) return { ok: false, error: limit.error };

  const plan = await getEffectivePlan(user.id);
  const templateHasImages = await resolveTemplateHasImages(
    user.id,
    parsed.data.templateId,
  );
  const featureCheck = validateAutoReplyPlanInput(plan, {
    ...parsed.data,
    templateHasImages,
  });
  if (!featureCheck.ok) return { ok: false, error: featureCheck.error };

  try {
    await assertChatsOwned(user.id, parsed.data.chatMids);
    await assertConnectedIfEnabled(user.id, parsed.data.enabled);
    await workerFetch(`/line/${user.id}/auto-reply/rules`, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    await recordAudit(user.id, "auto_reply.create", {
      targetType: "auto_reply_rule",
    });
    revalidatePath("/dashboard/auto-reply");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "error",
    };
  }
}

export async function updateAutoReplyRule(
  ruleId: string,
  input: Partial<z.infer<typeof ruleSchema>>,
): Promise<ActionResult> {
  const user = await requireUser();
  if (input.includeKeywords) {
    const match = validateMatchInput({
      includeKeywords: input.includeKeywords,
      excludeKeywords: input.excludeKeywords ?? [],
      emojiFilter: input.emojiFilter ?? "any",
      matchMode: input.matchMode ?? "contains",
    });
    if (!match.ok) return { ok: false, error: match.error };
  }

  try {
    if (input.chatMids?.length) {
      await assertChatsOwned(user.id, input.chatMids);
    }
    const plan = await getEffectivePlan(user.id);
    let templateIdForCheck = input.templateId;
    if (templateIdForCheck === undefined) {
      const [existing] = await db
        .select({ templateId: autoReplyRules.templateId })
        .from(autoReplyRules)
        .where(
          and(
            eq(autoReplyRules.id, ruleId),
            eq(autoReplyRules.userId, user.id),
          ),
        )
        .limit(1);
      templateIdForCheck = existing?.templateId ?? null;
    }
    const templateHasImages = await resolveTemplateHasImages(
      user.id,
      templateIdForCheck,
    );
    const featureCheck = validateAutoReplyPlanInput(plan, {
      ...input,
      templateHasImages,
    });
    if (!featureCheck.ok) return { ok: false, error: featureCheck.error };

    await assertConnectedIfEnabled(user.id, input.enabled);
    await workerFetch(`/line/${user.id}/auto-reply/rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    await recordAudit(user.id, "auto_reply.update", {
      targetType: "auto_reply_rule",
      targetId: ruleId,
    });
    revalidatePath("/dashboard/auto-reply");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "error",
    };
  }
}

export async function deleteAutoReplyRule(ruleId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await workerFetch(`/line/${user.id}/auto-reply/rules/${ruleId}`, {
      method: "DELETE",
    });
    await recordAudit(user.id, "auto_reply.delete", {
      targetType: "auto_reply_rule",
      targetId: ruleId,
    });
    revalidatePath("/dashboard/auto-reply");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "error",
    };
  }
}

export async function toggleAutoReplyRule(
  ruleId: string,
  enabled: boolean,
): Promise<ActionResult> {
  return updateAutoReplyRule(ruleId, { enabled });
}
