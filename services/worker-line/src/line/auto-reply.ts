import { and, desc, eq, sql, asc } from "drizzle-orm";

import {
  autoReplyRules,
  countAutoReplyRules,
  db,
  getEffectivePlanForUser,
  lineChats,
  templates,
  type AutoReplyRule,
} from "@line/db";
import { resolveImageAssetIds } from "@line/shared/image-assets";
import { validateAutoReplyPlanInput } from "@line/shared/plan-features";
import { isPlanLocked } from "@line/shared/plan";
import {
  messageMatchesRule,
  normalizeChatMids,
  validateMatchInput,
  type AutoReplyEmojiFilter,
} from "@line/shared/auto-reply-match";

import { env } from "../env.js";
import { log } from "../logger.js";
import { pruneAbsentChatMidsFromRules } from "./auto-reply-prune.js";
import {
  loadSquareSyncTokens,
} from "./square-sync-store.js";

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

export type AutoReplyDeps = {
  getClient: (userId: string) => Promise<unknown>;
  fetchMessages: (
    userId: string,
    client: unknown,
    chatMid: string,
    limit?: number,
    squareSyncByChat?: Map<string, string>,
    drainBacklog?: boolean,
  ) => Promise<InboundMessage[]>;
  decryptText: (
    userId: string,
    client: unknown,
    chatMid: string,
    msg: InboundMessage,
  ) => Promise<string | null>;
  getChatKind: (
    userId: string,
    chatMid: string,
  ) => Promise<"group" | "square">;
  sendText: (
    userId: string,
    chatMid: string,
    text: string,
    relatedMessageId?: string,
  ) => Promise<void>;
  sendImages: (
    userId: string,
    chatMid: string,
    assetIds: string[],
    relatedMessageId?: string,
  ) => Promise<void>;
  /** @deprecated use sendImages */
  sendImage?: (
    userId: string,
    chatMid: string,
    assetId: string,
    relatedMessageId?: string,
  ) => Promise<void>;
};

let deps: AutoReplyDeps | undefined;

type InboundMessage = {
  id?: string;
  from?: string;
  to?: string;
  chunks?: Array<Buffer | Uint8Array | string>;
  contentMetadata?: Record<string, string>;
  text?: string;
};

type LineClient = {
  base?: {
    profile?: { mid?: string };
  };
};

type ResolvedReply = {
  replyText?: string;
  replyImageAssetIds: string[];
};

export function initAutoReplyRuntime(runtimeDeps: AutoReplyDeps): void {
  deps = runtimeDeps;
}

type AutoReplyRuntime = {
  rules: AutoReplyRule[];
  seenByChat: Map<string, Set<string>>;
  squareSyncByChat: Map<string, string>;
  lastMatchByRule: Map<string, number>;
  startedAt: number;
  tickCount: number;
  primed: boolean;
};

const runtimes = new Map<string, AutoReplyRuntime>();

let coordinatorAbort: AbortController | null = null;
let coordinatorRoundRobin = 0;

function requireDeps(): AutoReplyDeps {
  if (!deps) {
    throw new Error("Auto-reply runtime is not initialized");
  }
  return deps;
}

const SEEN_MESSAGE_IDS_PER_CHAT = 500;

function collectChatMids(rules: AutoReplyRule[]): string[] {
  return [...new Set(rules.flatMap((r) => r.chatMids ?? []))];
}

/** Exported for unit tests. */
export { collectChatMids };

export async function pruneAutoReplyRulesForAbsentChats(
  userId: string,
): Promise<boolean> {
  const absentRows = await db
    .select({ chatMid: lineChats.chatMid })
    .from(lineChats)
    .where(and(eq(lineChats.userId, userId), eq(lineChats.present, false)));
  if (!absentRows.length) return false;

  const absentSet = new Set(absentRows.map((r) => r.chatMid));
  const rules = await db
    .select({
      id: autoReplyRules.id,
      chatMids: autoReplyRules.chatMids,
      enabled: autoReplyRules.enabled,
    })
    .from(autoReplyRules)
    .where(eq(autoReplyRules.userId, userId));

  const updates = pruneAbsentChatMidsFromRules(
    rules.map((r) => ({
      id: r.id,
      chatMids: r.chatMids ?? [],
      enabled: r.enabled,
    })),
    absentSet,
  );
  if (!updates.length) return false;

  for (const update of updates) {
    await db
      .update(autoReplyRules)
      .set({
        chatMids: update.chatMids,
        ...(update.disable ? { enabled: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(autoReplyRules.id, update.id));
    if (update.disable) {
      log("info", "auto-reply rule disabled after chat prune", {
        userId,
        ruleId: update.id,
      });
    }
  }
  return true;
}

async function hydrateSquareSyncMap(
  userId: string,
  chatMids: string[],
  target: Map<string, string>,
): Promise<void> {
  const stored = await loadSquareSyncTokens(userId, chatMids);
  for (const [mid, token] of stored) {
    target.set(mid, token);
  }
}

/** Exported for unit tests. */
export function usersPerCoordinatorBatch(
  totalUsers: number,
  tickMs: number,
  cycleSec: number,
): number {
  const safeTickMs = Math.max(50, tickMs);
  const cycleMs = Math.max(1000, cycleSec * 1000);
  const ticksPerCycle = Math.max(1, Math.floor(cycleMs / safeTickMs));
  return Math.max(1, Math.ceil(totalUsers / ticksPerCycle));
}

function trackSeenMessage(seen: Set<string>, messageId: string): void {
  seen.add(messageId);
  while (seen.size > SEEN_MESSAGE_IDS_PER_CHAT) {
    const oldest = seen.values().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
}

function stopRuntime(userId: string): void {
  runtimes.delete(userId);
  if (!runtimes.size) {
    coordinatorAbort?.abort();
    coordinatorAbort = null;
  }
}

export function stopAutoReplyListener(userId: string): void {
  stopRuntime(userId);
}

export function stopAllAutoReplyListeners(): void {
  for (const userId of [...runtimes.keys()]) {
    stopRuntime(userId);
  }
}

async function loadEnabledRules(userId: string): Promise<AutoReplyRule[]> {
  return db
    .select()
    .from(autoReplyRules)
    .where(
      and(eq(autoReplyRules.userId, userId), eq(autoReplyRules.enabled, true)),
    )
    .orderBy(desc(autoReplyRules.priority), asc(autoReplyRules.createdAt));
}

async function resolveRuleReply(rule: AutoReplyRule): Promise<ResolvedReply> {
  let replyText = rule.replyText ?? undefined;
  let replyImageAssetIds = resolveImageAssetIds(rule.replyImageAssetIds);
  if (rule.templateId) {
    const [tpl] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, rule.templateId))
      .limit(1);
    if (tpl) {
      if (replyText == null && tpl.body) replyText = tpl.body;
      if (replyImageAssetIds.length === 0) {
        replyImageAssetIds = resolveImageAssetIds(tpl.imageAssetIds);
      }
    }
  }
  return { replyText, replyImageAssetIds };
}

async function validateRuleReplyContent(
  rule: Pick<
    AutoReplyRule,
    | "replyText"
    | "replyImageAssetIds"
    | "templateId"
  >,
): Promise<{ ok: true; resolved: ResolvedReply } | { ok: false; error: string }> {
  const resolved = await resolveRuleReply(rule as AutoReplyRule);
  if (!resolved.replyText?.trim() && resolved.replyImageAssetIds.length === 0) {
    return { ok: false, error: "reply_content_required" };
  }
  return { ok: true, resolved };
}

async function recordMatch(ruleId: string): Promise<void> {
  await db
    .update(autoReplyRules)
    .set({
      matchedCount: sql`${autoReplyRules.matchedCount} + 1`,
      lastMatchedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(autoReplyRules.id, ruleId));
}

async function primeSeenMessages(
  userId: string,
  client: unknown,
  chatMids: string[],
  seenByChat: Map<string, Set<string>>,
  squareSyncByChat: Map<string, string>,
): Promise<void> {
  const { fetchMessages } = requireDeps();
  for (const chatMid of chatMids) {
    const seen = seenByChat.get(chatMid) ?? new Set<string>();
    seenByChat.set(chatMid, seen);
    try {
      const initial = await fetchMessages(
        userId,
        client,
        chatMid,
        100,
        squareSyncByChat,
        true,
      );
      for (const msg of initial) {
        if (msg.id) seen.add(msg.id);
      }
    } catch (err) {
      console.warn(`[auto-reply] prime failed for ${chatMid}:`, err);
    }
  }
}

async function sendResolvedReply(
  userId: string,
  chatMid: string,
  resolved: ResolvedReply,
  relatedMessageId?: string,
): Promise<void> {
  const { sendText, sendImages, sendImage } = requireDeps();
  const quoteId = relatedMessageId?.trim() || undefined;
  if (resolved.replyText?.trim()) {
    await sendText(userId, chatMid, resolved.replyText, quoteId);
  }
  if (resolved.replyImageAssetIds.length > 0) {
    if (resolved.replyText?.trim()) {
      await new Promise((r) => setTimeout(r, 1200));
    }
    if (sendImages) {
      await sendImages(userId, chatMid, resolved.replyImageAssetIds, quoteId);
    } else if (sendImage) {
      for (const assetId of resolved.replyImageAssetIds) {
        await sendImage(userId, chatMid, assetId, quoteId);
      }
    }
  }
}

async function pollUserOnce(userId: string, runtime: AutoReplyRuntime): Promise<void> {
  const { getClient, fetchMessages, decryptText } = requireDeps();
  const client = (await getClient(userId)) as LineClient | null;
  if (!client) return;

  let chatMids = collectChatMids(runtime.rules);
  if (!runtime.primed) {
    await primeSeenMessages(
      userId,
      client,
      chatMids,
      runtime.seenByChat,
      runtime.squareSyncByChat,
    );
    runtime.primed = true;
  }

  runtime.tickCount += 1;
  if (runtime.tickCount % 60 === 0) {
    runtime.rules = await loadEnabledRules(userId);
    chatMids = collectChatMids(runtime.rules);
    if (!runtime.rules.length) {
      stopRuntime(userId);
      return;
    }
  }

  const myMid = client.base?.profile?.mid;
  if (!myMid) return;

  for (const chatMid of chatMids) {
    const rules = runtime.rules
      .filter((r) => r.chatMids.includes(chatMid))
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
    if (!rules.length) continue;

    const seen = runtime.seenByChat.get(chatMid) ?? new Set<string>();
    runtime.seenByChat.set(chatMid, seen);

    let messages: InboundMessage[];
    try {
      messages = await fetchMessages(
        userId,
        client,
        chatMid,
        100,
        runtime.squareSyncByChat,
      );
    } catch (fetchErr) {
      console.warn(`[auto-reply] fetch failed for ${chatMid}:`, fetchErr);
      continue;
    }

    const sorted = [...messages].sort((a, b) => {
      const ai = BigInt(a.id ?? "0");
      const bi = BigInt(b.id ?? "0");
      if (ai < bi) return -1;
      if (ai > bi) return 1;
      return 0;
    });

    for (const msg of sorted) {
      if (!msg.id || seen.has(msg.id)) continue;
      trackSeenMessage(seen, msg.id);
      if (msg.from === myMid) continue;

      const text = await decryptText(userId, client, chatMid, msg);
      if (!text?.trim()) continue;

      for (const rule of rules) {
        if (
          !messageMatchesRule(text, {
            includeKeywords: rule.includeKeywords,
            excludeKeywords: rule.excludeKeywords,
            emojiFilter: rule.emojiFilter,
            matchMode: rule.matchMode,
            includeMatch: rule.includeMatch,
          })
        ) {
          continue;
        }

        const resolved = await resolveRuleReply(rule);
        if (!resolved.replyText?.trim() && resolved.replyImageAssetIds.length === 0) continue;
        if (
          resolved.replyText?.trim() &&
          text.trim() === resolved.replyText.trim()
        ) {
          continue;
        }

        const lastAt = runtime.lastMatchByRule.get(rule.id) ?? 0;
        const cooldownMs = Math.max(0, rule.cooldownSec) * 1000;
        if (Date.now() - lastAt < cooldownMs) continue;

        await sendResolvedReply(userId, chatMid, resolved, msg.id);
        runtime.lastMatchByRule.set(rule.id, Date.now());
        await recordMatch(rule.id);
        console.log(
          `[auto-reply] matched rule ${rule.id} for ${userId} in ${chatMid}`,
        );
        break;
      }
    }
  }

  if (env.HIBERNATE_AFTER_AUTO_REPLY_POLL) {
    const { hibernateLineSession } = await import("./manager.js");
    hibernateLineSession(userId);
  }
}

function usersPerCoordinatorBatchLocal(totalUsers: number): number {
  return usersPerCoordinatorBatch(
    totalUsers,
    env.AUTO_REPLY_TICK_MS,
    env.AUTO_REPLY_CYCLE_SEC,
  );
}

function ensureGlobalCoordinator(): void {
  if (coordinatorAbort) return;
  coordinatorAbort = new AbortController();
  const signal = coordinatorAbort.signal;

  void (async () => {
    console.log(
      `[auto-reply] coordinator started (cycle=${env.AUTO_REPLY_CYCLE_SEC}s tick=${env.AUTO_REPLY_TICK_MS}ms)`,
    );
    while (!signal.aborted) {
      const userIds = [...runtimes.keys()];
      if (!userIds.length) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      const batch = usersPerCoordinatorBatchLocal(userIds.length);
      for (let i = 0; i < batch; i++) {
        if (!userIds.length) break;
        const idx = (coordinatorRoundRobin + i) % userIds.length;
        const userId = userIds[idx]!;
        const runtime = runtimes.get(userId);
        if (runtime) {
          try {
            await pollUserOnce(userId, runtime);
          } catch (err) {
            console.warn(`[auto-reply] poll failed for ${userId}:`, err);
          }
        }
      }
      coordinatorRoundRobin =
        (coordinatorRoundRobin + batch) % Math.max(userIds.length, 1);

      await new Promise((r) => setTimeout(r, env.AUTO_REPLY_TICK_MS));
    }
    console.log("[auto-reply] coordinator stopped");
  })();
}

export function getAutoReplyCoordinatorStats(): {
  activeUsers: number;
  cycleSec: number;
  tickMs: number;
  usersPerBatch: number;
} {
  const n = runtimes.size;
  return {
    activeUsers: n,
    cycleSec: env.AUTO_REPLY_CYCLE_SEC,
    tickMs: env.AUTO_REPLY_TICK_MS,
    usersPerBatch: usersPerCoordinatorBatchLocal(n),
  };
}

/** Register a synthetic auto-reply user for capacity benchmarks (no DB). */
export function registerAutoReplyBenchmarkUser(userId: string): void {
  const runtime: AutoReplyRuntime = {
    rules: [
      {
        id: `bench-${userId}`,
        userId,
        chatMids: ["bench-chat"],
        includeKeywords: ["bench"],
        excludeKeywords: [],
        emojiFilter: "any",
        replyText: "ok",
        templateId: null,
        replyImageAssetIds: [],
        matchMode: "contains",
        includeMatch: "all",
        enabled: true,
        cooldownSec: 30,
        priority: 0,
        matchedCount: 0,
        lastMatchedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    seenByChat: new Map(),
    squareSyncByChat: new Map(),
    lastMatchByRule: new Map(),
    startedAt: Date.now(),
    tickCount: 0,
    primed: true,
  };
  runtimes.set(userId, runtime);
  ensureGlobalCoordinator();
}

/** Start or restart the always-on listener from enabled DB rules. */
export async function syncAutoReplyListener(userId: string): Promise<{
  listening: boolean;
  ruleCount: number;
}> {
  const plan = await getEffectivePlanForUser(userId);
  if (isPlanLocked(plan)) {
    stopRuntime(userId);
    return { listening: false, ruleCount: 0 };
  }

  const rules = await loadEnabledRules(userId);
  stopRuntime(userId);

  if (!rules.length) {
    return { listening: false, ruleCount: 0 };
  }

  const runtime: AutoReplyRuntime = {
    rules,
    seenByChat: new Map(),
    squareSyncByChat: new Map(),
    lastMatchByRule: new Map(),
    startedAt: Date.now(),
    tickCount: 0,
    primed: false,
  };
  await hydrateSquareSyncMap(userId, collectChatMids(rules), runtime.squareSyncByChat);
  runtimes.set(userId, runtime);
  ensureGlobalCoordinator();
  console.log(
    `[auto-reply] registered ${userId} (${runtime.rules.length} rule(s))`,
  );
  return { listening: true, ruleCount: rules.length };
}

export async function restoreAutoReplyOnBoot(): Promise<void> {
  try {
    const rows = await db
      .selectDistinct({ userId: autoReplyRules.userId })
      .from(autoReplyRules)
      .where(eq(autoReplyRules.enabled, true));
    let started = 0;
    for (const { userId } of rows) {
      const rules = await loadEnabledRules(userId);
      if (!rules.length) continue;
      const runtime: AutoReplyRuntime = {
        rules,
        seenByChat: new Map(),
        squareSyncByChat: new Map(),
        lastMatchByRule: new Map(),
        startedAt: Date.now(),
        tickCount: 0,
        primed: false,
      };
      runtimes.set(userId, runtime);
      started += 1;
    }
    if (started > 0) {
      ensureGlobalCoordinator();
      console.log(`[auto-reply] restored ${started} listener(s) on boot`);
    }
  } catch (err) {
    console.warn("[auto-reply] restore on boot failed:", err);
  }
}

export function getAutoReplyRuntimeStatus(userId: string): {
  listening: boolean;
  ruleCount?: number;
  elapsedSec?: number;
  chatMids?: string[];
} {
  const runtime = runtimes.get(userId);
  if (!runtime) return { listening: false };
  return {
    listening: true,
    ruleCount: runtime.rules.length,
    elapsedSec: Math.floor((Date.now() - runtime.startedAt) / 1000),
    chatMids: collectChatMids(runtime.rules),
  };
}

export async function listAutoReplyRules(
  userId: string,
): Promise<AutoReplyRule[]> {
  return db
    .select()
    .from(autoReplyRules)
    .where(eq(autoReplyRules.userId, userId))
    .orderBy(desc(autoReplyRules.priority), asc(autoReplyRules.createdAt));
}

export async function createAutoReplyRule(
  userId: string,
  input: {
    chatMids: string[];
    includeKeywords: string[];
    excludeKeywords?: string[];
    emojiFilter?: AutoReplyEmojiFilter;
    replyText?: string | null;
    templateId?: string | null;
    replyImageAssetIds?: string[];
    matchMode?: AutoReplyRule["matchMode"];
    includeMatch?: AutoReplyRule["includeMatch"];
    enabled?: boolean;
    cooldownSec?: number;
    priority?: number;
  },
): Promise<AutoReplyRule> {
  const chatMids = normalizeChatMids(input.chatMids);
  if (!chatMids.length) throw new Error("chat_mids_required");

  const plan = await getEffectivePlanForUser(userId);
  if (isPlanLocked(plan)) {
    throw new Error("plan_locked");
  }
  const ruleCount = await countAutoReplyRules(userId);
  if (ruleCount >= plan.maxAutoReplyRules) {
    throw new Error("plan_limit_auto_reply_rules");
  }

  const featureCheck = validateAutoReplyPlanInput(plan, {
    ...input,
    templateHasImages: await resolveTemplateHasImages(
      userId,
      input.templateId ?? null,
    ),
  });
  if (!featureCheck.ok) throw new Error(featureCheck.error);

  const matchValidation = validateMatchInput({
    includeKeywords: input.includeKeywords,
    excludeKeywords: input.excludeKeywords ?? [],
    emojiFilter: input.emojiFilter ?? "any",
    matchMode: input.matchMode ?? "contains",
    includeMatch: input.includeMatch ?? "all",
  });
  if (!matchValidation.ok) throw new Error(matchValidation.error);

  const imageIds = normalizeReplyImageIds(input.replyImageAssetIds);
  const draft = {
    replyText: input.replyText ?? null,
    replyImageAssetIds: imageIds,
    templateId: input.templateId ?? null,
  };
  const validation = await validateRuleReplyContent(draft);
  if (!validation.ok && (input.enabled ?? true)) {
    throw new Error(validation.error);
  }

  const { normalized } = matchValidation;
  const [row] = await db
    .insert(autoReplyRules)
    .values({
      userId,
      chatMids,
      includeKeywords: normalized.includeKeywords,
      excludeKeywords: normalized.excludeKeywords,
      emojiFilter: normalized.emojiFilter,
      replyText: input.replyText ?? null,
      templateId: input.templateId ?? null,
      replyImageAssetIds: imageIds,
      matchMode: normalized.matchMode,
      includeMatch: normalized.includeMatch,
      enabled: input.enabled ?? true,
      cooldownSec: input.cooldownSec ?? 30,
      priority: input.priority ?? 0,
    })
    .returning();
  if (!row) throw new Error("Failed to create auto-reply rule");
  if (row.enabled) {
    await syncAutoReplyListener(userId);
  }
  return row;
}

export async function updateAutoReplyRule(
  userId: string,
  ruleId: string,
  patch: {
    chatMids?: string[];
    includeKeywords?: string[];
    excludeKeywords?: string[];
    emojiFilter?: AutoReplyEmojiFilter;
    replyText?: string | null;
    templateId?: string | null;
    replyImageAssetIds?: string[];
    matchMode?: AutoReplyRule["matchMode"];
    includeMatch?: AutoReplyRule["includeMatch"];
    enabled?: boolean;
    cooldownSec?: number;
    priority?: number;
  },
): Promise<AutoReplyRule | null> {
  const [existing] = await db
    .select()
    .from(autoReplyRules)
    .where(
      and(eq(autoReplyRules.id, ruleId), eq(autoReplyRules.userId, userId)),
    )
    .limit(1);
  if (!existing) return null;

  const plan = await getEffectivePlanForUser(userId);
  const mergedTemplateId =
    patch.templateId !== undefined ? patch.templateId : existing.templateId;
  const featureCheck = validateAutoReplyPlanInput(plan, {
    excludeKeywords: patch.excludeKeywords ?? existing.excludeKeywords,
    emojiFilter: patch.emojiFilter ?? existing.emojiFilter,
    matchMode: patch.matchMode ?? existing.matchMode,
    replyImageAssetIds:
      patch.replyImageAssetIds !== undefined
        ? patch.replyImageAssetIds
        : resolveImageAssetIds(existing.replyImageAssetIds),
    cooldownSec: patch.cooldownSec ?? existing.cooldownSec,
    priority: patch.priority ?? existing.priority,
    templateHasImages: await resolveTemplateHasImages(
      userId,
      mergedTemplateId,
    ),
  });
  if (!featureCheck.ok) throw new Error(featureCheck.error);

  if (patch.chatMids !== undefined) {
    const chatMids = normalizeChatMids(patch.chatMids);
    if (!chatMids.length) throw new Error("chat_mids_required");
    patch.chatMids = chatMids;
  }

  const matchValidation = validateMatchInput({
    includeKeywords: patch.includeKeywords ?? existing.includeKeywords,
    excludeKeywords: patch.excludeKeywords ?? existing.excludeKeywords,
    emojiFilter: patch.emojiFilter ?? existing.emojiFilter,
    matchMode: patch.matchMode ?? existing.matchMode,
    includeMatch: patch.includeMatch ?? existing.includeMatch,
  });
  if (!matchValidation.ok) throw new Error(matchValidation.error);

  const imageIds =
    patch.replyImageAssetIds !== undefined
      ? normalizeReplyImageIds(patch.replyImageAssetIds, existing.replyImageAssetIds)
      : resolveImageAssetIds(existing.replyImageAssetIds);

  const merged = {
    replyText: patch.replyText !== undefined ? patch.replyText : existing.replyText,
    replyImageAssetIds: imageIds,
    templateId:
      patch.templateId !== undefined ? patch.templateId : existing.templateId,
    enabled: patch.enabled !== undefined ? patch.enabled : existing.enabled,
  };
  const validation = await validateRuleReplyContent(merged);
  if (!validation.ok && merged.enabled) {
    throw new Error(validation.error);
  }

  const { normalized } = matchValidation;
  const [row] = await db
    .update(autoReplyRules)
    .set({
      ...patch,
      includeKeywords: normalized.includeKeywords,
      excludeKeywords: normalized.excludeKeywords,
      emojiFilter: normalized.emojiFilter,
      matchMode: normalized.matchMode,
      includeMatch: normalized.includeMatch,
      replyImageAssetIds: imageIds,
      updatedAt: new Date(),
    })
    .where(
      and(eq(autoReplyRules.id, ruleId), eq(autoReplyRules.userId, userId)),
    )
    .returning();
  if (!row) return null;
  await syncAutoReplyListener(userId);
  return row;
}

export async function deleteAutoReplyRule(
  userId: string,
  ruleId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(autoReplyRules)
    .where(
      and(eq(autoReplyRules.id, ruleId), eq(autoReplyRules.userId, userId)),
    )
    .returning({ id: autoReplyRules.id });
  if (!deleted.length) return false;
  await syncAutoReplyListener(userId);
  return true;
}

function normalizeReplyImageIds(
  many?: string[] | null,
  fallbackMany?: string[] | null,
): string[] {
  if (many !== undefined && many !== null) {
    return many.filter(Boolean);
  }
  return resolveImageAssetIds(fallbackMany);
}
