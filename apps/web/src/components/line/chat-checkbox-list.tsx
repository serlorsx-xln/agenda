"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { filterChatsByQuery } from "@/components/line/chat-search";
import { cn } from "@/lib/utils";

export type ChatCheckboxItem = {
  chatMid: string;
  name: string;
  kind?: "group" | "square" | string;
  present: boolean;
};

export function ChatCheckboxList({
  chats,
  selected,
  onToggle,
  maxSelected,
  onMaxReached,
  className,
  listClassName,
  groupUnavailableSuffix,
  splitByKind = true,
  groupLabel,
  openChatLabel,
}: {
  chats: ChatCheckboxItem[];
  selected: Set<string>;
  onToggle: (chatMid: string) => void;
  maxSelected?: number;
  onMaxReached?: () => void;
  className?: string;
  listClassName?: string;
  groupUnavailableSuffix?: string;
  splitByKind?: boolean;
  groupLabel?: string;
  openChatLabel?: string;
}) {
  const t = useTranslations("common");
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () => filterChatsByQuery(chats, query),
    [chats, query],
  );

  const groups = React.useMemo(() => {
    if (!splitByKind) {
      return [{ label: null as string | null, items: filtered }];
    }
    const groupItems = filtered.filter((c) => c.kind === "group");
    const squareItems = filtered.filter((c) => c.kind === "square");
    const other = filtered.filter(
      (c) => c.kind !== "group" && c.kind !== "square",
    );
    const sections: { label: string | null; items: ChatCheckboxItem[] }[] = [];
    if (groupItems.length > 0) {
      sections.push({ label: groupLabel ?? null, items: groupItems });
    }
    if (squareItems.length > 0) {
      sections.push({ label: openChatLabel ?? null, items: squareItems });
    }
    if (other.length > 0) {
      sections.push({ label: null, items: other });
    }
    if (sections.length === 0) {
      sections.push({ label: null, items: [] });
    }
    return sections;
  }, [filtered, splitByKind, groupLabel, openChatLabel]);

  function handleToggle(mid: string, present: boolean) {
    if (!present) return;
    if (
      maxSelected != null &&
      !selected.has(mid) &&
      selected.size >= maxSelected
    ) {
      onMaxReached?.();
      return;
    }
    onToggle(mid);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchChats")}
        aria-label={t("searchChats")}
      />
      <div
        className={cn(
          "max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-2",
          listClassName,
        )}
      >
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-caption text-muted-foreground">
            {chats.length === 0 ? t("noChats") : t("noSearchResults")}
          </p>
        ) : (
          groups.map((section, idx) =>
            section.items.length === 0 ? null : (
              <div key={section.label ?? `sec-${idx}`} className="space-y-1">
                {section.label ? (
                  <p className="text-caption font-medium text-muted-foreground">
                    {section.label}
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {section.items.map((chat) => {
                    const checked = selected.has(chat.chatMid);
                    const blockedByMax =
                      maxSelected != null &&
                      !checked &&
                      selected.size >= maxSelected;
                    return (
                      <li key={chat.chatMid}>
                        <label
                          className={cn(
                            "flex min-h-10 items-center gap-3 rounded-md p-2",
                            chat.present
                              ? "cursor-pointer hover:bg-muted"
                              : "cursor-not-allowed opacity-50",
                            blockedByMax && "opacity-60",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-[hsl(var(--primary))]"
                            checked={checked}
                            onChange={() =>
                              handleToggle(chat.chatMid, chat.present)
                            }
                            disabled={!chat.present}
                          />
                          <span className="min-w-0 flex-1 truncate text-small">
                            {chat.name}
                            {!chat.present && groupUnavailableSuffix
                              ? ` ${groupUnavailableSuffix}`
                              : ""}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
