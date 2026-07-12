import { describe, expect, it } from "vitest";

import { publicErrorMessage } from "./logger.js";

describe("publicErrorMessage", () => {
  it("passes through known stable codes", () => {
    expect(publicErrorMessage(new Error("LINE account not connected"))).toBe(
      "LINE account not connected",
    );
    expect(
      publicErrorMessage(new Error("e2ee_keys_invalid — reset")),
    ).toContain("e2ee_keys_invalid");
  });

  it("hides long internal errors", () => {
    const long = "x".repeat(250);
    expect(publicErrorMessage(new Error(long))).toBe("Request failed");
  });
});
