import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { APIError } from "better-auth/api";

import { db } from "@line/db";
import {
  account,
  session,
  user,
  verification,
} from "@line/db/schema";

import { sendEmail, renderAuthEmail } from "@/lib/email";
import { isNextBuildPhase, validateWebEnv } from "@/lib/env";
import {
  checkSignupRateLimit,
  getClientIpFromHeaders,
} from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";

// Build-time placeholder only; runtime validation rejects still-placeholder secrets.
const authSecret =
  process.env.BETTER_AUTH_SECRET ??
  "build_time_placeholder_secret_min_32_chars_xx";

export const auth = betterAuth({
  appName: "Agenda",
  secret: authSecret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  rateLimit: {
    enabled: true,
    window: 15 * 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 10 },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // LINE connect is the real gate - no signup email verification.
    requireEmailVerification: false,
    minPasswordLength: 8,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      const locale =
        "locale" in user && typeof user.locale === "string"
          ? user.locale
          : "th";
      const isTh = locale === "th";
      const siteUrl = getSiteUrl();
      const name = user.name?.trim() || (isTh ? "คุณ" : "there");
      const { html, text } = renderAuthEmail({
        siteUrl,
        actionUrl: url,
        copy: isTh
          ? {
              preview: "ลิงก์รีเซ็ตรหัสผ่าน Agenda - หมดอายุใน 1 ชั่วโมง",
              greeting: `สวัสดี ${name},`,
              body: "เราได้รับคำขอรีเซ็ตรหัสผ่านบัญชี Agenda ของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่",
              cta: "รีเซ็ตรหัสผ่าน",
              expiry: "ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง หากคุณไม่ได้เป็นคนขอ ให้เพิกเฉยอีเมลนี้",
              footer: "ส่งจาก ",
            }
          : {
              preview: "Agenda password reset link - expires in 1 hour",
              greeting: `Hi ${name},`,
              body: "We received a request to reset your Agenda password. Use the button below to choose a new one.",
              cta: "Reset password",
              expiry: "This link expires in 1 hour. If you did not request this, you can ignore this email.",
              footer: "Sent from ",
            },
      });
      await sendEmail({
        to: user.email,
        subject: isTh ? "รีเซ็ตรหัสผ่าน Agenda" : "Reset your Agenda password",
        html,
        text,
      });
    },
  },
  // Accept both http + https of the configured site URL (Cloudflare Flexible
  // serves https to browsers while origin env may still be http, and vice versa).
  trustedOrigins: (() => {
    const site = getSiteUrl().replace(/\/$/, "");
    const origins = new Set<string>([site]);
    try {
      const u = new URL(site);
      u.protocol = u.protocol === "https:" ? "http:" : "https:";
      origins.add(u.origin);
    } catch {
      /* ignore invalid site URL at build time */
    }
    return [...origins];
  })(),
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  user: {
    additionalFields: {
      locale: {
        type: "string",
        required: false,
        defaultValue: "th",
        input: false,
      },
    },
  },
  plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
  databaseHooks: {
    user: {
      create: {
        before: async (_user, ctx) => {
          const headers = ctx?.request?.headers;
          if (!headers) return;
          const ip = getClientIpFromHeaders(headers);
          if (!(await checkSignupRateLimit(ip))) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Too many signups. Please try again later.",
            });
          }
        },
      },
    },
  },
});

if (process.env.NODE_ENV === "production" && !isNextBuildPhase()) {
  validateWebEnv();
}

