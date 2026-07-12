import { describe, expect, it } from "vitest";

import { detectImageMime } from "./media-server.js";

describe("detectImageMime", () => {
  it("detects JPEG", () => {
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "image/jpeg",
    );
  });

  it("detects PNG", () => {
    expect(
      detectImageMime(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
  });

  it("rejects unknown bytes", () => {
    expect(detectImageMime(Buffer.from("not-an-image"))).toBeNull();
  });
});
