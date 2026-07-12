import "server-only";

import { createLogger } from "@/lib/logger";

const log = createLogger("email");

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const FROM_ADDRESS =
  process.env.RESEND_FROM_EMAIL ?? "Agenda <onboarding@resend.dev>";

/**
 * Send an email via Resend. Falls back to structured console logging when
 * RESEND_API_KEY is not configured (local dev).
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    log.info("email skipped (no RESEND_API_KEY)", {
      to: input.to,
      subject: input.subject,
      preview: input.text ?? input.html.slice(0, 200),
    });
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.error("resend request failed", {
      status: res.status,
      body,
      to: input.to,
      subject: input.subject,
    });
    throw new Error(`Failed to send email (${res.status})`);
  }
}
