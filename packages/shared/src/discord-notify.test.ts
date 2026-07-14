import { describe, expect, it } from "vitest";

import {
  DISCORD_EMBED_COLOR,
  buildDiscordNotifyPayload,
} from "./discord-notify";

describe("discord-notify", () => {
  it("builds slynxslip-style embed payload", () => {
    const body = buildDiscordNotifyPayload({
      service: "worker-line",
      title: "fatal",
      description: "Worker crashed",
      status: "ERROR",
      code: "ECONNREFUSED",
      detail: "connect failed",
    });
    expect(body.username).toBe("agenda · worker-line");
    expect(body.embeds).toHaveLength(1);
    const embed = body.embeds[0]!;
    expect(embed.color).toBe(DISCORD_EMBED_COLOR);
    expect(embed.title).toBe("worker-line · fatal");
    expect(embed.footer).toEqual({ text: "agenda · worker-line" });
    expect(embed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const fields = embed.fields as Array<{ name: string; value: string }>;
    expect(fields.map((f) => f.name)).toEqual([
      "Service",
      "Status",
      "Code",
      "Detail",
    ]);
  });
});
