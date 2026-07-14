/**
 * Discord webhook embeds — same visual language as slynxslip
 * (dark chrome color, username/footer `product · service`, RFC3339 timestamp).
 */

export const DISCORD_EMBED_COLOR = 0x2b2d31;

export type DiscordNotifyInput = {
  /** Service tag, e.g. web / worker-line */
  service: string;
  title?: string;
  description?: string;
  status?: string;
  code?: string;
  detail?: string;
  /** Extra named fields (empty values omitted). */
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
};

type DiscordField = { name: string; value: string; inline: boolean };

function addField(
  fields: DiscordField[],
  name: string,
  value: string | undefined,
  inline: boolean,
): void {
  const v = value?.trim();
  if (!v) return;
  fields.push({ name, value: v.slice(0, 1000), inline });
}

/** Build Discord webhook JSON body (no network). */
export function buildDiscordNotifyPayload(input: DiscordNotifyInput): {
  username: string;
  embeds: Array<Record<string, unknown>>;
} {
  const service = (input.service || "agenda").trim() || "agenda";
  const titleBase = (input.title || service).trim() || service;
  const title =
    titleBase === service || titleBase.startsWith(`${service} ·`)
      ? titleBase === service
        ? service
        : titleBase
      : `${service} · ${titleBase}`;

  const fields: DiscordField[] = [];
  addField(fields, "Service", service, true);
  addField(fields, "Status", input.status, true);
  addField(fields, "Code", input.code, true);
  for (const f of input.fields ?? []) {
    addField(fields, f.name, f.value, f.inline ?? true);
  }
  addField(fields, "Detail", input.detail, false);

  return {
    username: `agenda · ${service}`,
    embeds: [
      {
        title,
        description: input.description?.trim() || undefined,
        color: DISCORD_EMBED_COLOR,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: `agenda · ${service}` },
      },
    ],
  };
}

export function getDiscordWebhookUrl(): string | undefined {
  const raw = process.env.DISCORD_WEBHOOK_URL?.trim();
  return raw || undefined;
}

/**
 * Fire-and-forget Discord notify. Never throws to callers.
 */
export async function notifyDiscord(
  input: DiscordNotifyInput,
): Promise<{ ok: boolean; error?: string }> {
  const webhook = getDiscordWebhookUrl();
  if (!webhook) return { ok: false, error: "discord_webhook_unset" };

  try {
    const body = buildDiscordNotifyPayload(input);
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, error: `discord_http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "discord_notify_failed",
    };
  }
}
