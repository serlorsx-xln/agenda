import { describe, expect, it } from "vitest";

import {
  messageMatchesRule,
  normalizeKeywords,
  validateMatchInput,
} from "./auto-reply-match";

describe("auto-reply-match", () => {
  it("requires all include keywords when includeMatch is all", () => {
    expect(
      messageMatchesRule("ราคา สนใจครับ", {
        includeKeywords: ["ราคา", "สนใจ"],
        excludeKeywords: [],
        emojiFilter: "any",
        matchMode: "contains",
        includeMatch: "all",
      }),
    ).toBe(true);
    expect(
      messageMatchesRule("ราคาเท่าไหร่", {
        includeKeywords: ["ราคา", "สนใจ"],
        excludeKeywords: [],
        emojiFilter: "any",
        matchMode: "contains",
        includeMatch: "all",
      }),
    ).toBe(false);
  });

  it("matches any include keyword when includeMatch is any", () => {
    expect(
      messageMatchesRule("ทดสอบ", {
        includeKeywords: ["Test", "ทดสอบ"],
        excludeKeywords: [],
        emojiFilter: "any",
        matchMode: "contains",
        includeMatch: "any",
      }),
    ).toBe(true);
    expect(
      messageMatchesRule("hello", {
        includeKeywords: ["Test", "ทดสอบ"],
        excludeKeywords: [],
        emojiFilter: "any",
        matchMode: "contains",
        includeMatch: "any",
      }),
    ).toBe(false);
  });

  it("blocks excluded keywords", () => {
    expect(
      messageMatchesRule("ราคา spam", {
        includeKeywords: ["ราคา"],
        excludeKeywords: ["spam"],
        emojiFilter: "any",
        matchMode: "contains",
        includeMatch: "all",
      }),
    ).toBe(false);
  });

  it("filters emoji", () => {
    expect(
      messageMatchesRule("hello 😀", {
        includeKeywords: ["hello"],
        excludeKeywords: [],
        emojiFilter: "with_emoji",
        matchMode: "contains",
        includeMatch: "all",
      }),
    ).toBe(true);
    expect(
      messageMatchesRule("hello", {
        includeKeywords: ["hello"],
        excludeKeywords: [],
        emojiFilter: "with_emoji",
        matchMode: "contains",
        includeMatch: "all",
      }),
    ).toBe(false);
  });

  it("validates exact mode with single keyword", () => {
    expect(
      validateMatchInput({
        includeKeywords: ["hi", "bye"],
        excludeKeywords: [],
        emojiFilter: "any",
        matchMode: "exact",
        includeMatch: "all",
      }).ok,
    ).toBe(false);
    expect(normalizeKeywords([" A ", "a", "B"])).toEqual(["A", "B"]);
  });

  it("normalizes single-keyword rules to includeMatch all", () => {
    const result = validateMatchInput({
      includeKeywords: ["hello"],
      excludeKeywords: [],
      emojiFilter: "any",
      matchMode: "contains",
      includeMatch: "any",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.includeMatch).toBe("all");
    }
  });
});
