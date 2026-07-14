import { describe, expect, it } from "vitest";

import {
  messageMatchesRule,
  normalizeKeywords,
  validateMatchInput,
} from "./auto-reply-match";

describe("auto-reply-match", () => {
  it("matches if any include keyword is present in contains mode", () => {
    expect(
      messageMatchesRule("สนใจครับ", {
        includeKeywords: ["ราคา", "สนใจ"],
        excludeKeywords: [],
        emojiFilter: "any",
        matchMode: "contains",
      }),
    ).toBe(true);
    expect(
      messageMatchesRule("ทดสอบ", {
        includeKeywords: ["Test", "ทดสอบ"],
        excludeKeywords: [],
        emojiFilter: "any",
        matchMode: "contains",
      }),
    ).toBe(true);
    expect(
      messageMatchesRule("hello", {
        includeKeywords: ["ราคา", "สนใจ"],
        excludeKeywords: [],
        emojiFilter: "any",
        matchMode: "contains",
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
      }),
    ).toBe(true);
    expect(
      messageMatchesRule("hello", {
        includeKeywords: ["hello"],
        excludeKeywords: [],
        emojiFilter: "with_emoji",
        matchMode: "contains",
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
      }).ok,
    ).toBe(false);
    expect(normalizeKeywords([" A ", "a", "B"])).toEqual(["A", "B"]);
  });
});
