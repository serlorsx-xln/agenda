import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";

import { db, campaigns, campaignRuns } from "@line/db";
import { verifyWorkerUserToken } from "@line/shared/worker-token";

import { captureException } from "@line/shared/sentry";

import { env } from "../env.js";
import { log, publicErrorMessage } from "../logger.js";
import { getLtsmBridge } from "../line/ltsm-bridge.js";
import { getLineSessionPoolStats, lineManager } from "../line/manager.js";
import {
  createAutoReplyRule,
  deleteAutoReplyRule,
  getAutoReplyRuntimeStatus,
  listAutoReplyRules,
  syncAutoReplyListener,
  updateAutoReplyRule,
} from "../line/auto-reply.js";
import { anyRunning, cancelRun, runCampaignManual } from "../scheduler/runner.js";
import { isDaemonActive } from "../scheduler/daemon.js";

function safeKeyEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: "15mb" }));

  // Health endpoint (no auth) for container healthchecks.
  app.get("/health", async (_req, res) => {
    const ltsmHealthy = await getLtsmBridge().isHealthy().catch(() => false);
    const prod = process.env.NODE_ENV === "production";
    const poolStats = getLineSessionPoolStats();
    const body = prod
      ? { status: ltsmHealthy ? "ok" : "degraded" }
      : {
          status: ltsmHealthy ? "ok" : "degraded",
          lineConfigured: Boolean(env.LINE_DEVICE),
          lineSessionReady: lineManager.connectedCount() > 0,
          ltsmHealthy,
          connectedSessions: lineManager.connectedCount(),
          hotSessions: poolStats.hotSessions,
          maxHotSessions: poolStats.maxHotSessions,
          sessionPool: poolStats,
          campaignRunning: anyRunning(),
          daemonActive: isDaemonActive(),
        };
    res.status(ltsmHealthy ? 200 : 503).json(body);
  });

  // Internal auth for everything below.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const key = req.header("x-internal-key");
    if (!key || !safeKeyEqual(key, env.INTERNAL_API_KEY)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const token = req.header("x-worker-user-token");
    if (!token) {
      res.status(403).json({ error: "Missing user token" });
      return;
    }
    const verified = verifyWorkerUserToken(token, env.INTERNAL_API_KEY);
    if (!verified) {
      res.status(403).json({ error: "Invalid user token" });
      return;
    }
    (req as Request & { verifiedUserId?: string }).verifiedUserId =
      verified.userId;
    next();
  });

  app.use("/line/:userId", (req: Request, res: Response, next: NextFunction) => {
    const pathUserId = String(req.params.userId);
    const verifiedUserId = (req as Request & { verifiedUserId?: string })
      .verifiedUserId;
    if (verifiedUserId !== pathUserId) {
      res.status(403).json({ error: "User token mismatch" });
      return;
    }
    next();
  });

  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response) => {
      fn(req, res).catch((err: unknown) => {
        const message = publicErrorMessage(err);
        log("warn", "api request failed", {
          method: req.method,
          path: req.path,
          error: err instanceof Error ? err.message : String(err),
        });
        void captureException(err, {
          service: "worker-line",
          path: req.path,
          method: req.method,
        });
        if (!res.headersSent) res.status(400).json({ error: message });
      });
    };

  const param = (req: Request, key: string): string => String(req.params[key]);

  function verifiedUserId(req: Request): string {
    return (req as Request & { verifiedUserId?: string }).verifiedUserId ?? "";
  }

  app.post(
    "/line/:userId/connect",
    wrap(async (req, res) => {
      const force = Boolean((req.body as { force?: boolean } | undefined)?.force);
      const status = await lineManager.startLogin(param(req, "userId"), {
        force,
      });
      res.json(status);
    }),
  );

  app.get(
    "/line/:userId/status",
    wrap(async (req, res) => {
      res.json(lineManager.getStatus(param(req, "userId")));
    }),
  );

  app.post(
    "/line/:userId/disconnect",
    wrap(async (req, res) => {
      await lineManager.disconnect(param(req, "userId"));
      res.json({ ok: true });
    }),
  );

  app.post(
    "/line/:userId/reconnect",
    wrap(async (req, res) => {
      const status = await lineManager.refreshSession(param(req, "userId"));
      res.json(status);
    }),
  );

  app.post(
    "/line/:userId/reset-e2ee",
    wrap(async (req, res) => {
      const status = await lineManager.resetE2EEAndReconnect(
        param(req, "userId"),
      );
      res.json(status);
    }),
  );

  app.post(
    "/line/:userId/sync",
    wrap(async (req, res) => {
      const result = await lineManager.syncChats(param(req, "userId"));
      res.json(result);
    }),
  );

  app.post(
    "/line/:userId/send/text",
    wrap(async (req, res) => {
      const { chatMid, text, relatedMessageId } = req.body as {
        chatMid?: string;
        text?: string;
        relatedMessageId?: string;
      };
      if (!chatMid || !text) {
        res.status(400).json({ error: "chatMid and text are required" });
        return;
      }
      await lineManager.sendToChat(param(req, "userId"), chatMid, text, {
        relatedMessageId,
      });
      res.json({ ok: true });
    }),
  );

  app.post(
    "/line/:userId/send/image",
    wrap(async (req, res) => {
      const { chatMid, assetId, imageBase64, filename, mimeType, relatedMessageId } =
        req.body as {
          chatMid?: string;
          assetId?: string;
          imageBase64?: string;
          filename?: string;
          mimeType?: string;
          relatedMessageId?: string;
        };
      if (!chatMid) {
        res.status(400).json({ error: "chatMid is required" });
        return;
      }
      if (!assetId && !imageBase64) {
        res.status(400).json({ error: "assetId or imageBase64 is required" });
        return;
      }
      const result = await lineManager.sendImageToChat(
        param(req, "userId"),
        chatMid,
        { assetId, imageBase64, filename, mimeType, relatedMessageId },
      );
      res.json({ ok: true, ...result });
    }),
  );

  app.post(
    "/line/:userId/send/images",
    wrap(async (req, res) => {
      const { chatMid, assetIds, relatedMessageId } = req.body as {
        chatMid?: string;
        assetIds?: string[];
        relatedMessageId?: string;
      };
      if (!chatMid) {
        res.status(400).json({ error: "chatMid is required" });
        return;
      }
      if (!assetIds?.length) {
        res.status(400).json({ error: "assetIds is required" });
        return;
      }
      const result = await lineManager.sendImagesToChat(
        param(req, "userId"),
        chatMid,
        { assetIds, relatedMessageId },
      );
      res.json({ ok: true, ...result });
    }),
  );

  app.post(
    "/line/:userId/send/content",
    wrap(async (req, res) => {
      const { chatMid, text, imageAssetIds, relatedMessageId } = req.body as {
        chatMid?: string;
        text?: string | null;
        imageAssetIds?: string[];
        relatedMessageId?: string;
      };
      if (!chatMid) {
        res.status(400).json({ error: "chatMid is required" });
        return;
      }
      await lineManager.sendTemplateContent(param(req, "userId"), chatMid, {
        text,
        imageAssetIds,
        relatedMessageId,
      });
      res.json({ ok: true });
    }),
  );

  app.get(
    "/line/:userId/auto-reply/rules",
    wrap(async (req, res) => {
      const userId = param(req, "userId");
      const rules = await listAutoReplyRules(userId);
      res.json({
        rules,
        runtime: getAutoReplyRuntimeStatus(userId),
      });
    }),
  );

  app.post(
    "/line/:userId/auto-reply/rules",
    wrap(async (req, res) => {
      const body = req.body as {
        chatMids?: string[];
        includeKeywords?: string[];
        excludeKeywords?: string[];
        emojiFilter?: "any" | "with_emoji" | "without_emoji";
        replyText?: string | null;
        templateId?: string | null;
        replyImageAssetIds?: string[];
        matchMode?: "contains" | "exact";
        includeMatch?: "all" | "any";
        enabled?: boolean;
        cooldownSec?: number;
        priority?: number;
      };
      if (!body.chatMids?.length || !body.includeKeywords?.length) {
        res.status(400).json({
          error: "chatMids and includeKeywords are required",
        });
        return;
      }
      const rule = await createAutoReplyRule(param(req, "userId"), {
        chatMids: body.chatMids,
        includeKeywords: body.includeKeywords,
        excludeKeywords: body.excludeKeywords,
        emojiFilter: body.emojiFilter,
        replyText: body.replyText,
        templateId: body.templateId,
        replyImageAssetIds: body.replyImageAssetIds,
        matchMode: body.matchMode,
        includeMatch: body.includeMatch,
        enabled: body.enabled,
        cooldownSec: body.cooldownSec,
        priority: body.priority,
      });
      res.json({
        rule,
        runtime: getAutoReplyRuntimeStatus(param(req, "userId")),
      });
    }),
  );

  app.patch(
    "/line/:userId/auto-reply/rules/:ruleId",
    wrap(async (req, res) => {
      const rule = await updateAutoReplyRule(
        param(req, "userId"),
        param(req, "ruleId"),
        req.body as {
          chatMids?: string[];
          includeKeywords?: string[];
          excludeKeywords?: string[];
          emojiFilter?: "any" | "with_emoji" | "without_emoji";
          replyText?: string | null;
          templateId?: string | null;
          replyImageAssetIds?: string[];
          matchMode?: "contains" | "exact";
          includeMatch?: "all" | "any";
          enabled?: boolean;
          cooldownSec?: number;
          priority?: number;
        },
      );
      if (!rule) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }
      res.json({
        rule,
        runtime: getAutoReplyRuntimeStatus(param(req, "userId")),
      });
    }),
  );

  app.delete(
    "/line/:userId/auto-reply/rules/:ruleId",
    wrap(async (req, res) => {
      const deleted = await deleteAutoReplyRule(
        param(req, "userId"),
        param(req, "ruleId"),
      );
      if (!deleted) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }
      res.json({
        ok: true,
        runtime: getAutoReplyRuntimeStatus(param(req, "userId")),
      });
    }),
  );

  app.post(
    "/line/:userId/auto-reply/sync",
    wrap(async (req, res) => {
      res.json(await syncAutoReplyListener(param(req, "userId")));
    }),
  );

  app.get(
    "/line/:userId/friends",
    wrap(async (req, res) => {
      const friends = await lineManager.listFriends(param(req, "userId"));
      res.json({ friends });
    }),
  );

  app.post(
    "/campaigns/:campaignId/run",
    wrap(async (req, res) => {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, param(req, "campaignId")))
        .limit(1);
      if (!campaign) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }
      if (campaign.userId !== verifiedUserId(req)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const result = await runCampaignManual(campaign);
      if (!result.ok && result.reason) {
        console.warn(`[api] manual run skipped for ${campaign.id}:`, result.reason);
      }
      res.status(202).json({ ok: true, sent: result.sent ?? false });
    }),
  );

  app.post(
    "/runs/:runId/cancel",
    wrap(async (req, res) => {
      const runId = param(req, "runId");
      const [run] = await db
        .select({
          userId: campaignRuns.userId,
          campaignId: campaignRuns.campaignId,
          status: campaignRuns.status,
        })
        .from(campaignRuns)
        .where(eq(campaignRuns.id, runId))
        .limit(1);
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      if (run.userId !== verifiedUserId(req)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      cancelRun(runId);
      const now = new Date();
      if (run.status === "running" || run.status === "queued") {
        await db
          .update(campaignRuns)
          .set({ status: "cancelled", finishedAt: now })
          .where(eq(campaignRuns.id, runId));
        await db
          .update(campaigns)
          .set({ nextSendAt: null, updatedAt: now })
          .where(eq(campaigns.id, run.campaignId));
      }
      res.json({ ok: true });
    }),
  );

  return app;
}
