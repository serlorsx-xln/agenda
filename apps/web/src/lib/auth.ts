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

import { sendEmail } from "@/lib/email";
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

/** Email verification only when Resend is configured; otherwise login is blocked with no way to verify. */
const emailDeliveryEnabled = Boolean(process.env.RESEND_API_KEY?.trim());

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
    requireEmailVerification: emailDeliveryEnabled,
    minPasswordLength: 8,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      const locale =
        "locale" in user && typeof user.locale === "string"
          ? user.locale
          : "th";
      const isTh = locale === "th";
      await sendEmail({
        to: user.email,
        subject: isTh ? "รีเซ็ตรหัสผ่าน" : "Reset your password",
        html: isTh
          ? `<p>สวัสดี ${user.name},</p><p><a href="${url}">คลิกที่นี่</a> เพื่อรีเซ็ตรหัสผ่านของคุณ ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง</p>`
          : `<p>Hi ${user.name},</p><p><a href="${url}">Click here</a> to reset your password. This link expires in one hour.</p>`,
        text: isTh
          ? `รีเซ็ตรหัสผ่าน: ${url}`
          : `Reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: emailDeliveryEnabled,
    sendVerificationEmail: async ({ user, url }) => {
      const locale =
        "locale" in user && typeof user.locale === "string"
          ? user.locale
          : "th";
      const isTh = locale === "th";
      await sendEmail({
        to: user.email,
        subject: isTh ? "ยืนยันอีเมล" : "Verify your email",
        html: isTh
          ? `<p>สวัสดี ${user.name},</p><p><a href="${url}">คลิกที่นี่</a> เพื่อยืนยันอีเมลของคุณ</p>`
          : `<p>Hi ${user.name},</p><p><a href="${url}">Click here</a> to verify your email address.</p>`,
        text: isTh ? `ยืนยันอีเมล: ${url}` : `Verify your email: ${url}`,
      });
    },
  },
  trustedOrigins: [getSiteUrl()],
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

