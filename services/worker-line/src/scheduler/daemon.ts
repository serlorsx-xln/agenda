import cron, { type ScheduledTask } from "node-cron";
import { eq } from "drizzle-orm";

import { db, campaigns, type Campaign } from "@line/db";

import { env } from "../env.js";
import {
  enqueueCronSend,
  processDueSends,
  seedCampaignQueues,
} from "./send-queue.js";
import { runTrialExpiryJob } from "./trial-expiry.js";

type CronRegistration = {
  expr: string;
  timezone: string;
  task: ScheduledTask;
};

const cronRegistry = new Map<string, CronRegistration>();
let tickTimer: NodeJS.Timeout | null = null;
let daemonActive = false;
let lastTrialExpiryDay: string | null = null;

export function isDaemonActive(): boolean {
  return daemonActive;
}

function reconcileCron(enabled: Campaign[]): void {
  const wanted = new Map<string, Campaign>();
  for (const c of enabled) {
    if (c.cronExpr && cron.validate(c.cronExpr)) {
      wanted.set(c.id, c);
    }
  }

  for (const [id, reg] of cronRegistry.entries()) {
    const c = wanted.get(id);
    if (!c || c.cronExpr !== reg.expr || c.timezone !== reg.timezone) {
      reg.task.stop();
      cronRegistry.delete(id);
    }
  }

  for (const [id, c] of wanted.entries()) {
    if (cronRegistry.has(id)) continue;
    const expr = c.cronExpr!;
    try {
      const task = cron.schedule(
        expr,
        () => {
          void (async () => {
            const [fresh] = await db
              .select()
              .from(campaigns)
              .where(eq(campaigns.id, id))
              .limit(1);
            if (fresh?.enabled) await enqueueCronSend(fresh);
          })();
        },
        { timezone: c.timezone },
      );
      cronRegistry.set(id, { expr, timezone: c.timezone, task });
      console.log(`[daemon] scheduled cron for campaign ${id}: ${expr}`);
    } catch (err) {
      console.warn(`[daemon] failed to schedule cron for ${id}:`, err);
    }
  }
}

async function maybeRunTrialExpiry(): Promise<void> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (lastTrialExpiryDay === today) return;
  lastTrialExpiryDay = today;
  await runTrialExpiryJob();
}

async function tick(): Promise<void> {
  await maybeRunTrialExpiry();

  let enabled: Campaign[];
  try {
    enabled = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.enabled, true));
  } catch (err) {
    console.warn("[daemon] failed to load campaigns:", err);
    return;
  }

  reconcileCron(enabled);

  // Window campaigns (no cron): seed queue when within window.
  const windowOnly = enabled.filter(
    (c) => !c.cronExpr || !cron.validate(c.cronExpr),
  );
  await seedCampaignQueues(windowOnly);

  await processDueSends();
}

export function startDaemon(): void {
  if (daemonActive) return;
  daemonActive = true;
  const intervalMs = Math.max(5, env.SCHEDULER_TICK_SECONDS) * 1000;
  setTimeout(() => void tick(), 3000);
  tickTimer = setInterval(() => void tick(), intervalMs);
  console.log(`[daemon] started (tick=${env.SCHEDULER_TICK_SECONDS}s)`);
}

export function stopDaemon(): void {
  daemonActive = false;
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  for (const reg of cronRegistry.values()) reg.task.stop();
  cronRegistry.clear();
  console.log("[daemon] stopped");
}
