import { describe, expect, it } from "vitest";

import {
  collectChatMids,
  usersPerCoordinatorBatch,
} from "./auto-reply.js";

describe("auto-reply coordinator helpers", () => {
  describe("usersPerCoordinatorBatch", () => {
    it("spreads users across coordinator ticks in a cycle", () => {
      expect(usersPerCoordinatorBatch(100, 100, 30)).toBe(1);
      expect(usersPerCoordinatorBatch(300, 100, 30)).toBe(1);
      expect(usersPerCoordinatorBatch(600, 100, 30)).toBe(2);
    });

    it("never returns less than 1 user per batch", () => {
      expect(usersPerCoordinatorBatch(0, 100, 30)).toBe(1);
      expect(usersPerCoordinatorBatch(5, 10, 1)).toBe(1);
    });

    it("clamps unsafe tick and cycle values", () => {
      expect(usersPerCoordinatorBatch(50, 0, 30)).toBe(1);
      expect(usersPerCoordinatorBatch(50, 10, 0)).toBe(3);
    });
  });

  describe("collectChatMids", () => {
    it("deduplicates chat mids across rules", () => {
      const mids = collectChatMids([
        { chatMids: ["a", "b"] } as never,
        { chatMids: ["b", "c"] } as never,
        { chatMids: undefined } as never,
      ]);
      expect(mids.sort()).toEqual(["a", "b", "c"]);
    });
  });
});
