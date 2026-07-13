import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** Decode legacy rows where bytea stored the literal "\\x..." hex text instead of raw bytes. */
function normalizeByteaBuffer(buf: Buffer): Buffer {
  const b0 = buf[0];
  const b1 = buf[1];
  const b2 = buf[2];
  if (
    buf.length >= 4 &&
    b0 === 0x5c &&
    b1 === 0x78 &&
    b2 !== undefined &&
    b2 >= 0x30 &&
    b2 <= 0x39
  ) {
    const hex = buf.subarray(2).toString("ascii");
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      return Buffer.from(hex, "hex");
    }
  }
  return buf;
}

const bytea = customType<{ data: Buffer; driverData: Buffer | string }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: unknown): Buffer {
    let buf: Buffer;
    if (Buffer.isBuffer(value)) {
      buf = value;
    } else if (value instanceof Uint8Array) {
      buf = Buffer.from(value);
    } else if (typeof value === "string") {
      buf = value.startsWith("\\x")
        ? Buffer.from(value.slice(2), "hex")
        : Buffer.from(value, "hex");
    } else {
      buf = Buffer.from(value as Uint8Array);
    }
    return normalizeByteaBuffer(buf);
  },
});

/* -------------------------------------------------------------------------- */
/*  Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const userRole = pgEnum("user_role", ["user", "admin"]);

export const lineConnectionStatus = pgEnum("line_connection_status", [
  "disconnected",
  "connecting",
  "connected",
  "error",
]);

export const lineChatKind = pgEnum("line_chat_kind", ["square", "group"]);

export const autoReplyMatchMode = pgEnum("auto_reply_match_mode", [
  "contains",
  "exact",
]);

export const autoReplyEmojiFilter = pgEnum("auto_reply_emoji_filter", [
  "any",
  "with_emoji",
  "without_emoji",
]);

export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "archived",
]);

export const campaignRunStatus = pgEnum("campaign_run_status", [
  "queued",
  "running",
  "success",
  "partial",
  "failed",
  "cancelled",
]);

export const runTrigger = pgEnum("run_trigger", ["scheduled", "manual"]);

export const runEventStatus = pgEnum("run_event_status", [
  "success",
  "failed",
  "skipped",
  "info",
]);

export const subscriptionPlan = pgEnum("subscription_plan", [
  "free",
  "starter",
  "growth",
  "pro",
]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "active",
  "past_due",
  "cancelled",
  "inactive",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "paid",
  "failed",
  "expired",
]);

/* -------------------------------------------------------------------------- */
/*  Better Auth core tables                                                     */
/*  Property keys are camelCase to match Better Auth field names; DB columns    */
/*  are snake_case via drizzle casing.                                          */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: userRole("role").default("user").notNull(),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  locale: text("locale").default("th").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  impersonatedBy: text("impersonated_by"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* -------------------------------------------------------------------------- */
/*  LINE domain tables                                                          */
/* -------------------------------------------------------------------------- */

export const lineConnection = pgTable(
  "line_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    status: lineConnectionStatus("status").default("disconnected").notNull(),
    mid: text("mid"),
    displayName: text("display_name"),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastCampaignSendAt: timestamp("last_campaign_send_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("line_connection_mid_unique")
      .on(t.mid)
      .where(sql`${t.mid} IS NOT NULL`),
  ],
);

export const lineChats = pgTable(
  "line_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chatMid: text("chat_mid").notNull(),
    name: text("name").notNull(),
    kind: lineChatKind("kind").default("square").notNull(),
    memberCount: integer("member_count"),
    present: boolean("present").default(true).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    missingSince: timestamp("missing_since", { withTimezone: true }),
    squareSyncToken: text("square_sync_token"),
  },
  (t) => [
    unique("line_chats_user_chat_unique").on(t.userId, t.chatMid),
    index("line_chats_user_idx").on(t.userId),
  ],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("media_assets_user_idx").on(t.userId)],
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    body: text("body"),
    imageAssetIds: jsonb("image_asset_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("templates_user_idx").on(t.userId)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => templates.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    status: campaignStatus("status").default("draft").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    // Scheduling
    timezone: text("timezone").default("Asia/Bangkok").notNull(),
    windowStartHour: integer("window_start_hour").default(9).notNull(),
    windowEndHour: integer("window_end_hour").default(21).notNull(),
    cronExpr: text("cron_expr"),
    maxSends: integer("max_sends").default(100).notNull(),
    // Human-like sending controls
    delayBetweenTargetsSec: integer("delay_between_targets_sec")
      .default(300)
      .notNull(),
    perChatCooldownSec: integer("per_chat_cooldown_sec")
      .default(1800)
      .notNull(),
    randomJitterSec: integer("random_jitter_sec").default(60).notNull(),
    autoStopOnErrors: integer("auto_stop_on_errors").default(3).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    sendRotationIndex: integer("send_rotation_index").default(0).notNull(),
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    dailyRunId: uuid("daily_run_id").references((): AnyPgColumn => campaignRuns.id, {
      onDelete: "set null",
    }),
    rateLimitStreak: integer("rate_limit_streak").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("campaigns_user_idx").on(t.userId)],
);

export const campaignTargets = pgTable(
  "campaign_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    chatMid: text("chat_mid").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("campaign_targets_unique").on(t.campaignId, t.chatMid),
    index("campaign_targets_campaign_idx").on(t.campaignId),
  ],
);

export const campaignRuns = pgTable(
  "campaign_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    status: campaignRunStatus("status").default("queued").notNull(),
    trigger: runTrigger("trigger").default("scheduled").notNull(),
    sentCount: integer("sent_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    skippedCount: integer("skipped_count").default(0).notNull(),
    totalTargets: integer("total_targets").default(0).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("campaign_runs_campaign_idx").on(t.campaignId),
    index("campaign_runs_user_idx").on(t.userId),
  ],
);

export const campaignRunEvents = pgTable(
  "campaign_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => campaignRuns.id, { onDelete: "cascade" }),
    chatMid: text("chat_mid"),
    chatName: text("chat_name"),
    status: runEventStatus("status").notNull(),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("campaign_run_events_run_idx").on(t.runId)],
);

export const campaignDailySends = pgTable(
  "campaign_daily_sends",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    statDate: date("stat_date").notNull(),
    chatMid: text("chat_mid").notNull(),
    sendCount: integer("send_count").default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.statDate, t.chatMid] }),
    index("campaign_daily_sends_campaign_date_idx").on(
      t.campaignId,
      t.statDate,
    ),
  ],
);

export const autoReplyRules = pgTable(
  "auto_reply_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chatMids: jsonb("chat_mids").$type<string[]>().default([]).notNull(),
    includeKeywords: jsonb("include_keywords")
      .$type<string[]>()
      .default([])
      .notNull(),
    excludeKeywords: jsonb("exclude_keywords")
      .$type<string[]>()
      .default([])
      .notNull(),
    emojiFilter: autoReplyEmojiFilter("emoji_filter")
      .default("any")
      .notNull(),
    replyText: text("reply_text"),
    templateId: uuid("template_id").references(() => templates.id, {
      onDelete: "set null",
    }),
    replyImageAssetIds: jsonb("reply_image_asset_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    matchMode: autoReplyMatchMode("match_mode").default("contains").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    cooldownSec: integer("cooldown_sec").default(30).notNull(),
    priority: integer("priority").default(0).notNull(),
    matchedCount: integer("matched_count").default(0).notNull(),
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("auto_reply_rules_user_idx").on(t.userId),
    index("auto_reply_rules_user_enabled_idx").on(t.userId, t.enabled),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Billing (PromptPay + SCB slip)                                               */
/* -------------------------------------------------------------------------- */

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  plan: subscriptionPlan("plan").default("free").notNull(),
  status: subscriptionStatus("status").default("active").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(
      () => subscriptions.id,
      { onDelete: "set null" },
    ),
    plan: subscriptionPlan("plan").notNull(),
    // amount stored in satang (1 THB = 100 satang) to avoid float issues
    amount: integer("amount").notNull(),
    currency: text("currency").default("THB").notNull(),
    status: paymentStatus("status").default("pending").notNull(),
    promptpayRef: text("promptpay_ref"),
    qrPayload: text("qr_payload"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    verifiedTran: text("verified_tran"),
    verifiedRef: text("verified_ref"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    slipReceiverMasked: text("slip_receiver_masked"),
    failureReason: text("failure_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("payments_user_idx").on(t.userId),
    uniqueIndex("payments_promptpay_ref_uidx").on(t.promptpayRef),
  ],
);

/** One-time anti-replay store for SCB slip TRAN / REF_ID values. */
export const slipClaims = pgTable("slip_claims", {
  tran: text("tran").primaryKey(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  refId: text("ref_id"),
  amountSatang: integer("amount_satang"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* -------------------------------------------------------------------------- */
/*  Audit log                                                                   */
/* -------------------------------------------------------------------------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("audit_log_user_idx").on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/*  App settings (single-row scaffold, seeded)                                  */
/* -------------------------------------------------------------------------- */

export const signupRateLimits = pgTable("signup_rate_limits", {
  ip: text("ip").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* -------------------------------------------------------------------------- */
/*  Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const userRelations = relations(user, ({ many, one }) => ({
  templates: many(templates),
  campaigns: many(campaigns),
  chats: many(lineChats),
  connection: one(lineConnection, {
    fields: [user.id],
    references: [lineConnection.userId],
  }),
  subscription: one(subscriptions, {
    fields: [user.id],
    references: [subscriptions.userId],
  }),
}));

export const campaignRelations = relations(campaigns, ({ many, one }) => ({
  template: one(templates, {
    fields: [campaigns.templateId],
    references: [templates.id],
  }),
  targets: many(campaignTargets),
  runs: many(campaignRuns),
}));

export const campaignRunRelations = relations(campaignRuns, ({ many, one }) => ({
  campaign: one(campaigns, {
    fields: [campaignRuns.campaignId],
    references: [campaigns.id],
  }),
  events: many(campaignRunEvents),
}));

export const campaignRunEventRelations = relations(
  campaignRunEvents,
  ({ one }) => ({
    run: one(campaignRuns, {
      fields: [campaignRunEvents.runId],
      references: [campaignRuns.id],
    }),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type User = typeof user.$inferSelect;
export type LineConnection = typeof lineConnection.$inferSelect;
export type LineChat = typeof lineChats.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignTarget = typeof campaignTargets.$inferSelect;
export type CampaignRun = typeof campaignRuns.$inferSelect;
export type CampaignRunEvent = typeof campaignRunEvents.$inferSelect;
export type AutoReplyRule = typeof autoReplyRules.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type SlipClaim = typeof slipClaims.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
