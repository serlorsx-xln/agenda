import { describe, expect, it } from "vitest";

import { filterChatsByQuery } from "./chat-search";

describe("filterChatsByQuery", () => {
  const chats = [
    { chatMid: "uabc123", name: "Marketing Team", kind: "group" },
    { chatMid: "cdef456", name: "OpenChat โปร", kind: "square" },
  ];

  it("returns all when query empty", () => {
    expect(filterChatsByQuery(chats, "  ")).toHaveLength(2);
  });

  it("matches name case-insensitively", () => {
    expect(filterChatsByQuery(chats, "marketing")).toEqual([chats[0]]);
  });

  it("matches chat mid", () => {
    expect(filterChatsByQuery(chats, "cdef")).toEqual([chats[1]]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterChatsByQuery(chats, "zzz")).toEqual([]);
  });
});
