import "server-only";

import { brand } from "@/lib/brand";
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

/** Escape user-controlled strings before interpolating into HTML email bodies. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type AuthEmailCopy = {
  preview: string;
  greeting: string;
  body: string;
  cta: string;
  expiry: string;
  footer: string;
};

/**
 * Branded transactional email layout aligned with the Agenda web UI
 * (light surface, teal CTA, filled logo mark, LINE Seed Sans).
 * Table-based for clients. Web fonts load from the live site when supported.
 */
export function renderAuthEmail(input: {
  siteUrl: string;
  actionUrl: string;
  copy: AuthEmailCopy;
}): { html: string; text: string } {
  const siteBase = input.siteUrl.replace(/\/$/, "");
  const site = escapeHtml(siteBase);
  const action = escapeHtml(input.actionUrl);
  const { copy } = input;
  const fontRg = escapeHtml(`${siteBase}/fonts/LINESeedSansTH_W_Rg.woff2`);
  const fontBd = escapeHtml(`${siteBase}/fonts/LINESeedSansTH_W_Bd.woff2`);
  const fontXBd = escapeHtml(`${siteBase}/fonts/LINESeedSansTH_W_XBd.woff2`);
  const fontStack =
    "'LINE Seed Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(copy.cta)}</title>
  <style type="text/css">
    @font-face {
      font-family: "LINE Seed Sans";
      src: url("${fontRg}") format("woff2");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "LINE Seed Sans";
      src: url("${fontBd}") format("woff2");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "LINE Seed Sans";
      src: url("${fontXBd}") format("woff2");
      font-weight: 800;
      font-style: normal;
      font-display: swap;
    }
  </style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a, p { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${brand.neutral.surface};font-family:${fontStack};color:${brand.neutral.foreground};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${brand.neutral.surface};padding:32px 16px;font-family:${fontStack};">
    <tr>
      <td align="center" style="font-family:${fontStack};">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background-color:${brand.neutral.background};border:1px solid ${brand.neutral.border};border-radius:10px;overflow:hidden;font-family:${fontStack};">
          <tr>
            <td style="padding:28px 32px 8px 32px;font-family:${fontStack};">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="width:16px;height:16px;border-radius:4px;background-color:${brand.primary.hex};line-height:0;font-size:0;text-align:center;vertical-align:middle;">
                    <span style="display:inline-block;width:6px;height:6px;border-radius:1px;background-color:${brand.neutral.onPrimary};">&nbsp;</span>
                  </td>
                  <td style="padding-left:10px;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${brand.neutral.foreground};line-height:1;font-family:${fontStack};">Agenda</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px 32px;font-family:${fontStack};">
              <p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;color:${brand.neutral.foreground};font-family:${fontStack};">${escapeHtml(copy.greeting)}</p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:${brand.neutral.body};font-family:${fontStack};">${escapeHtml(copy.body)}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;">
                <tr>
                  <td style="border-radius:8px;background-color:${brand.primary.hex};">
                    <a href="${action}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:700;color:${brand.neutral.onPrimary};text-decoration:none;border-radius:8px;font-family:${fontStack};">
                      ${escapeHtml(copy.cta)}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#71717a;font-family:${fontStack};">${escapeHtml(copy.expiry)}</p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;word-break:break-all;font-family:${fontStack};">
                <a href="${action}" style="color:#71717a;text-decoration:underline;font-family:${fontStack};">${action}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px 32px;border-top:1px solid #f4f4f5;font-family:${fontStack};">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;font-family:${fontStack};">
                ${escapeHtml(copy.footer)}
                <a href="${site}" style="color:#71717a;text-decoration:none;font-family:${fontStack};">Agenda</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    copy.greeting,
    "",
    copy.body,
    "",
    `${copy.cta}: ${input.actionUrl}`,
    copy.expiry,
    "",
    copy.footer,
    input.siteUrl,
  ].join("\n");

  return { html, text };
}

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
