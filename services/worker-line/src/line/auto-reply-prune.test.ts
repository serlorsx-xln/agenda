import { describe, expect, it } from "vitest";

import { pruneAbsentChatMidsFromRules } from "./auto-reply-prune.js";

describe("pruneAbsentChatMidsFromRules", () => {
  it("removes absent mids from rules", () => {
    const updates = pruneAbsentChatMidsFromRules(
      [{ id: "r1", chatMids: ["a", "b", "c"], enabled: true }],
      new Set(["b"]),
    );
    expect(updates).toEqual([
      { id: "r1", chatMids: ["a", "c"], disable: false },
    ]);
  });

  it("disables rules with no chats left", () => {
    const updates = pruneAbsentChatMidsFromRules(
      [{ id: "r1", chatMids: ["a"], enabled: true }],
      new Set(["a"]),
    );
    expect(updates).toEqual([{ id: "r1", chatMids: [], disable: true }]);
  });

  it("skips rules with no absent mids", () => {
    const updates = pruneAbsentChatMidsFromRules(
      [{ id: "r1", chatMids: ["a"], enabled: true }],
      new Set(["x"]),
    );
    expect(updates).toEqual([]);
  });
});
