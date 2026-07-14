"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconDelete, IconEdit, IconLoader, IconPlus } from "@/lib/icons";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createAutoReplyRule,
  deleteAutoReplyRule,
  toggleAutoReplyRule,
  updateAutoReplyRule,
} from "@/app/(dashboard)/dashboard/auto-reply/actions";
import { ChatCheckboxList } from "@/components/line/chat-checkbox-list";
import { ImageUploadPreview } from "@/components/media/image-upload-preview";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { FieldHint, FieldLabel } from "@/components/ui/field-hint";
import { resolveImageAssetIds } from "@line/shared/image-assets";
import type { PlanFeatures } from "@line/shared/plan";
import type { UpgradeLimitType } from "@/lib/plan-usage-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type EmojiFilter = "any" | "with_emoji" | "without_emoji";

type Rule = {
  id: string;
  chatMids: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  emojiFilter: EmojiFilter;
  replyText: string | null;
  templateId: string | null;
  replyImageAssetIds?: string[];
  matchMode: "contains" | "exact";
  includeMatch?: "all" | "any";
  enabled: boolean;
  cooldownSec: number;
  priority: number;
  matchedCount: number;
  lastMatchedAt: string | null;
};

type Chat = { chatMid: string; name: string; kind: string; present: boolean };
type Template = {
  id: string;
  name: string;
  body: string | null;
  imageAssetIds?: string[];
};

type PriorityTier = "normal" | "important" | "veryImportant";

const PRIORITY_BY_TIER: Record<PriorityTier, number> = {
  normal: 0,
  important: 50,
  veryImportant: 100,
};

const PRIORITY_TIERS: PriorityTier[] = ["normal", "important", "veryImportant"];

function priorityToTier(value: number): PriorityTier {
  if (value >= 50) return "veryImportant";
  if (value > 0) return "important";
  return "normal";
}

function isAdvancedRule(rule: Rule | null): boolean {
  if (!rule) return false;
  return (
    rule.excludeKeywords.length > 0 ||
    rule.emojiFilter !== "any" ||
    rule.matchMode === "exact" ||
    rule.includeMatch === "any" ||
    rule.priority > 0 ||
    rule.cooldownSec !== 30 ||
    resolveImageAssetIds(rule.replyImageAssetIds ?? []).length > 0 ||
    rule.includeKeywords.length > 1
  );
}

function KeywordListEditor({
  label,
  hint,
  addLabel,
  keywords,
  onChange,
  optional,
}: {
  label: string;
  hint?: string;
  addLabel: string;
  keywords: string[];
  onChange: (next: string[]) => void;
  optional?: boolean;
}) {
  const [draft, setDraft] = React.useState("");

  function addKeyword() {
    const word = draft.trim();
    if (!word) return;
    if (keywords.some((k) => k.toLowerCase() === word.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...keywords, word]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {optional ? (
          <span className="ml-1 font-normal text-muted-foreground">
            ({hint})
          </span>
        ) : null}
      </Label>
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((word) => (
            <Badge key={word} variant="secondary" className="gap-1 pr-1">
              {word}
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted"
                onClick={() => onChange(keywords.filter((k) => k !== word))}
                aria-label={`Remove ${word}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addKeyword();
            }
          }}
          placeholder={hint}
        />
        <Button type="button" variant="secondary" onClick={addKeyword}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

function formatChatLabel(
  chatMids: string[],
  chatNameByMid: Record<string, string>,
  t: (key: string, values?: { count: number }) => string,
): string {
  if (chatMids.length === 0) return "-";
  if (chatMids.length <= 2) {
    return chatMids
      .map((mid) => chatNameByMid[mid] ?? mid)
      .join(", ");
  }
  return t("chatCount", { count: chatMids.length });
}

export function AutoReplyClient({
  rules,
  runtime,
  chats,
  templates,
  chatNameByMid,
  connected,
  workerError,
  e2eeStatus = "ok",
  planFeatures,
  isLocked = false,
  trialStarted = true,
}: {
  rules: Rule[];
  runtime: {
    listening: boolean;
    ruleCount?: number;
    elapsedSec?: number;
  };
  chats: Chat[];
  templates: Template[];
  chatNameByMid: Record<string, string>;
  connected: boolean;
  workerError?: string;
  e2eeStatus?: "ok" | "degraded" | "invalid";
  planFeatures: PlanFeatures;
  isLocked?: boolean;
  trialStarted?: boolean;
}) {
  const t = useTranslations("autoReply");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const router = useRouter();

  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [upgradeLimit, setUpgradeLimit] =
    React.useState<UpgradeLimitType>("auto_reply_rules");
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState("");

  React.useEffect(() => {
    if (workerError) {
      setStatusMessage(t("workerUnavailable"));
      return;
    }
    if (e2eeStatus === "degraded" || e2eeStatus === "invalid") {
      setStatusMessage(t("e2eeDegraded"));
      return;
    }
    setStatusMessage(
      runtime.listening
        ? t("runtime.listening", {
            count: runtime.ruleCount ?? 0,
            sec: runtime.elapsedSec ?? 0,
          })
        : t("runtime.stopped"),
    );
  }, [workerError, e2eeStatus, runtime, t]);

  function handlePlanLimit(code: string) {
    if (code === "plan_locked") {
      setUpgradeLimit("plan_locked");
      setUpgradeOpen(true);
      return true;
    }
    if (code === "plan_limit_auto_reply_rules") {
      setUpgradeLimit("auto_reply_rules");
      setUpgradeOpen(true);
      return true;
    }
    return false;
  }

  function actionErrorMessage(error?: string) {
    if (!error) return tt("error");
    return t(`errors.${error}` as never);
  }

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Rule | null>(null);
  const [pickerKey, setPickerKey] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  const [selectedChats, setSelectedChats] = React.useState<Set<string>>(
    new Set(),
  );
  const [includeKeywords, setIncludeKeywords] = React.useState<string[]>([]);
  const [excludeKeywords, setExcludeKeywords] = React.useState<string[]>([]);
  const [emojiFilter, setEmojiFilter] = React.useState<EmojiFilter>("any");
  const [matchMode, setMatchMode] = React.useState<"contains" | "exact">(
    "contains",
  );
  const [includeMatch, setIncludeMatch] = React.useState<"all" | "any">("all");
  const [templateId, setTemplateId] = React.useState<string>("");
  const [replyText, setReplyText] = React.useState("");
  const [replyImageAssetIds, setReplyImageAssetIds] = React.useState<string[]>(
    [],
  );
  const [cooldownSec, setCooldownSec] = React.useState(30);
  const [priorityTier, setPriorityTier] = React.useState<PriorityTier>("normal");
  const [enabled, setEnabled] = React.useState(true);
  const [simpleMode, setSimpleMode] = React.useState(true);

  const hasTemplate = templateId.length > 0;
  const selectedTemplate = templates.find((tpl) => tpl.id === templateId);

  function handleTemplateChange(value: string) {
    setTemplateId(value);
    if (value) {
      setReplyText("");
      setReplyImageAssetIds([]);
    }
  }

  function toggleChat(chatMid: string) {
    const chat = chats.find((c) => c.chatMid === chatMid);
    if (chat && !chat.present) return;
    setSelectedChats((prev) => {
      const next = new Set(prev);
      if (next.has(chatMid)) next.delete(chatMid);
      else next.add(chatMid);
      return next;
    });
  }

  function resetForm(rule?: Rule | null) {
    setEditing(rule ?? null);
    setSelectedChats(new Set(rule?.chatMids ?? []));
    setIncludeKeywords(rule?.includeKeywords ?? []);
    setExcludeKeywords(rule?.excludeKeywords ?? []);
    setEmojiFilter(rule?.emojiFilter ?? "any");
    setMatchMode(rule?.matchMode ?? "contains");
    setIncludeMatch(rule?.includeMatch ?? "all");
    setTemplateId(rule?.templateId ?? "");
    setReplyText(rule?.replyText ?? "");
    setReplyImageAssetIds(
      resolveImageAssetIds(rule?.replyImageAssetIds ?? []),
    );
    setCooldownSec(rule?.cooldownSec ?? 30);
    setPriorityTier(priorityToTier(rule?.priority ?? 0));
    setEnabled(rule?.enabled ?? true);
    setSimpleMode(rule ? !isAdvancedRule(rule) : true);
  }

  function openNew() {
    resetForm(null);
    setPickerKey((k) => k + 1);
    setOpen(true);
  }

  function openEdit(rule: Rule) {
    resetForm(rule);
    setPickerKey((k) => k + 1);
    setOpen(true);
  }

  async function save() {
    if (selectedChats.size === 0 || includeKeywords.length === 0) return;
    if (!hasTemplate) {
      const hasText = replyText.trim().length > 0;
      const hasImages =
        !simpleMode &&
        resolveImageAssetIds(replyImageAssetIds).length > 0;
      if (!hasText && !hasImages) {
        toast.error(t("errors.replyRequired"));
        return;
      }
    }
    setSaving(true);
    try {
      const keywordsForSave = simpleMode
        ? includeKeywords.slice(0, 1)
        : includeKeywords;
      const payload = {
        chatMids: Array.from(selectedChats),
        includeKeywords: keywordsForSave,
        excludeKeywords: simpleMode ? [] : excludeKeywords,
        emojiFilter: simpleMode ? ("any" as const) : emojiFilter,
        matchMode: simpleMode
          ? ("contains" as const)
          : keywordsForSave.length > 1 && matchMode === "exact"
            ? ("contains" as const)
            : matchMode,
        includeMatch: simpleMode
          ? ("all" as const)
          : keywordsForSave.length <= 1
            ? ("all" as const)
            : includeMatch,
        templateId: templateId || null,
        replyText: hasTemplate ? null : replyText.trim() || null,
        replyImageAssetIds:
          hasTemplate || simpleMode ? [] : replyImageAssetIds,
        cooldownSec: simpleMode ? 30 : cooldownSec,
        priority: simpleMode ? 0 : PRIORITY_BY_TIER[priorityTier],
        enabled,
      };
      const res = editing
        ? await updateAutoReplyRule(editing.id, payload)
        : await createAutoReplyRule(payload);
      if (!res.ok) throw new Error(res.error);
      toast.success(editing ? tt("saved") : tt("created"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!handlePlanLimit(msg)) {
        toast.error(actionErrorMessage(msg));
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteAutoReplyRule(deleteTarget);
    setDeleting(false);
    if (!res.ok) {
      toast.error(actionErrorMessage(res.error));
      return;
    }
    toast.success(tt("deleted"));
    setDeleteTarget(null);
    router.refresh();
  }

  async function toggle(id: string, next: boolean) {
    const res = await toggleAutoReplyRule(id, next);
    if (!res.ok) {
      toast.error(actionErrorMessage(res.error));
      return;
    }
    router.refresh();
  }

  return (
    <>
      {!connected && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 text-small">
            {t("notConnected")}{" "}
            <Link href="/dashboard/connect" className="underline">
              {t("connectLink")}
            </Link>
          </CardContent>
        </Card>
      )}

      {workerError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-small text-destructive">
            {t("workerUnavailable")}
          </CardContent>
        </Card>
      )}

      {(e2eeStatus === "degraded" || e2eeStatus === "invalid") && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 text-small">
            {t("e2eeDegraded")}{" "}
            <Link href="/dashboard/connect" className="underline">
              {t("e2eeResetLink")}
            </Link>
          </CardContent>
        </Card>
      )}

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="space-y-1">
            <p className="text-small font-medium">{t("runtime.title")}</p>
            <p className="text-caption text-muted-foreground">{statusMessage}</p>
          </div>
          <Badge variant={runtime.listening ? "success" : "muted"}>
            {runtime.listening ? t("runtime.active") : t("runtime.inactive")}
          </Badge>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={openNew}
          disabled={!connected || chats.length === 0 || isLocked}
        >
          <IconPlus className="h-4 w-4" />
          {t("new")}
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-small text-muted-foreground">
            {chats.length === 0 ? t("emptyNoChats") : t("empty")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {rules.map((rule) => {
              const thumbId = resolveImageAssetIds(
                rule.replyImageAssetIds ?? [],
              )[0];
              return (
                <Card key={rule.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium">
                        {formatChatLabel(rule.chatMids, chatNameByMid, t)}
                      </p>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(rule)}
                          aria-label={tc("edit")}
                        >
                          <IconEdit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(rule.id)}
                          aria-label={tc("delete")}
                        >
                          <IconDelete className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {rule.includeKeywords.map((word) => (
                        <Badge key={word} variant="secondary">
                          {word}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1 text-caption text-muted-foreground">
                      <span>{t(`matchMode.${rule.matchMode}`)}</span>
                      {rule.includeKeywords.length > 1 && (
                        <span>
                          · {t(`includeMatch.${rule.includeMatch ?? "all"}`)}
                        </span>
                      )}
                      {rule.excludeKeywords.length > 0 && (
                        <Badge variant="outline">
                          {t("excludeCount", {
                            count: rule.excludeKeywords.length,
                          })}
                        </Badge>
                      )}
                      {rule.emojiFilter !== "any" && (
                        <Badge variant="outline">
                          {t(
                            `fields.emojiFilter.${rule.emojiFilter}` as never,
                          )}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {thumbId ? (
                        <img
                          src={`/api/media/${thumbId}`}
                          alt=""
                          className="h-8 w-8 rounded object-cover"
                        />
                      ) : null}
                      <span className="line-clamp-2 text-caption text-muted-foreground">
                        {rule.replyText ??
                          (rule.templateId
                            ? t("usesTemplate")
                            : t("imageOnly"))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-caption text-muted-foreground">
                        {t("matched", { count: rule.matchedCount })}
                      </span>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(v) => toggle(rule.id, v)}
                        aria-label={t("columns.enabled")}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="hidden md:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.chat")}</TableHead>
                  <TableHead>{t("columns.keyword")}</TableHead>
                  <TableHead>{t("columns.reply")}</TableHead>
                  <TableHead>{t("columns.stats")}</TableHead>
                  <TableHead>{t("columns.enabled")}</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => {
                  const thumbId = resolveImageAssetIds(
                    rule.replyImageAssetIds ?? [],
                  )[0];
                  return (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        {formatChatLabel(rule.chatMids, chatNameByMid, t)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {rule.includeKeywords.map((word) => (
                            <Badge key={word} variant="secondary">
                              {word}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1 text-caption text-muted-foreground">
                          <span>{t(`matchMode.${rule.matchMode}`)}</span>
                          {rule.includeKeywords.length > 1 && (
                            <span>
                              · {t(`includeMatch.${rule.includeMatch ?? "all"}`)}
                            </span>
                          )}
                          {rule.excludeKeywords.length > 0 && (
                            <Badge variant="outline">
                              {t("excludeCount", {
                                count: rule.excludeKeywords.length,
                              })}
                            </Badge>
                          )}
                          {rule.emojiFilter !== "any" && (
                            <Badge variant="outline">
                              {t(
                                `fields.emojiFilter.${rule.emojiFilter}` as never,
                              )}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="flex items-center gap-2">
                          {thumbId && (
                            <img
                              src={`/api/media/${thumbId}`}
                              alt=""
                              className="h-8 w-8 rounded object-cover"
                            />
                          )}
                          <span className="line-clamp-2 text-caption">
                            {rule.replyText ??
                              (rule.templateId
                                ? t("usesTemplate")
                                : t("imageOnly"))}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-caption">
                        {t("matched", { count: rule.matchedCount })}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={(v) => toggle(rule.id, v)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(rule)}
                            aria-label={tc("edit")}
                          >
                            <IconEdit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(rule.id)}
                            aria-label={tc("delete")}
                          >
                            <IconDelete className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("edit") : t("new")}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 rounded-md border border-border p-1">
            <Button
              type="button"
              variant={simpleMode ? "default" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setSimpleMode(true)}
            >
              {t("mode.simple")}
            </Button>
            <Button
              type="button"
              variant={!simpleMode ? "default" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setSimpleMode(false)}
            >
              {t("mode.advanced")}
            </Button>
            <FieldHint content={t("hints.mode")} className="shrink-0 self-center pr-1" />
          </div>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <FieldLabel
                label={`${t("fields.chats")} · ${t("fields.chatsSelected", { count: selectedChats.size })}`}
                hint={t("hints.chats")}
              />
              {chats.length === 0 ? (
                <p className="rounded-md border border-border p-3 text-small text-muted-foreground">
                  {t("emptyNoChats")}
                </p>
              ) : (
                <ChatCheckboxList
                  key={pickerKey}
                  chats={chats}
                  selected={selectedChats}
                  onToggle={toggleChat}
                  groupLabel={t("chatKinds.group")}
                  openChatLabel={t("chatKinds.openchat")}
                  groupUnavailableSuffix={`(${t("chatUnavailable")})`}
                />
              )}
            </div>

            {simpleMode ? (
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="ar-keyword"
                  label={t("fields.includeKeywordSimple")}
                  hint={t("hints.keyword")}
                />
                <Input
                  id="ar-keyword"
                  value={includeKeywords[0] ?? ""}
                  onChange={(e) => {
                    const word = e.target.value.trim();
                    // Keep remaining keywords in state so switching back to
                    // advanced does not lose chips; save() still trims in easy mode.
                    setIncludeKeywords((prev) => {
                      const rest = prev.slice(1);
                      return word ? [word, ...rest] : rest;
                    });
                  }}
                  placeholder={t("fields.includeKeywordSimpleHint")}
                />
                {includeKeywords.length > 1 ? (
                  <p className="text-caption text-muted-foreground">
                    {t("hints.simpleKeepsExtraKeywords", {
                      count: includeKeywords.length - 1,
                    })}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <KeywordListEditor
                  label={t("fields.includeKeywords")}
                  hint={t("fields.includeKeywordsHint")}
                  addLabel={t("fields.addKeyword")}
                  keywords={includeKeywords}
                  onChange={(next) => {
                    setIncludeKeywords(next);
                    if (next.length <= 1) setIncludeMatch("all");
                    if (next.length > 1 && matchMode === "exact") {
                      setMatchMode("contains");
                    }
                  }}
                />
                {includeKeywords.length > 1 ? (
                  <div className="space-y-1.5">
                    <FieldLabel
                      label={t("fields.includeMatch")}
                      hint={t("hints.includeMatch")}
                    />
                    <Select
                      value={includeMatch}
                      onChange={(e) =>
                        setIncludeMatch(e.target.value as "all" | "any")
                      }
                    >
                      <option value="all">{t("includeMatch.all")}</option>
                      <option value="any">{t("includeMatch.any")}</option>
                    </Select>
                  </div>
                ) : null}
              </>
            )}

            {!simpleMode && planFeatures.autoReplyExcludeKeywords && (
              <KeywordListEditor
                label={t("fields.excludeKeywords")}
                hint={t("fields.excludeKeywordsHint")}
                addLabel={t("fields.addKeyword")}
                keywords={excludeKeywords}
                onChange={setExcludeKeywords}
                optional
              />
            )}

            {!simpleMode && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("fields.emojiFilter.label")}</Label>
                <Select
                  value={emojiFilter}
                  onChange={(e) =>
                    setEmojiFilter(e.target.value as EmojiFilter)
                  }
                  disabled={!planFeatures.autoReplyEmojiFilter}
                >
                  <option value="any">
                    {t("fields.emojiFilter.any")}
                  </option>
                  <option value="with_emoji">
                    {t("fields.emojiFilter.with_emoji")}
                  </option>
                  <option value="without_emoji">
                    {t("fields.emojiFilter.without_emoji")}
                  </option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("fields.matchMode")}</Label>
                <Select
                  value={matchMode}
                  onChange={(e) =>
                    setMatchMode(e.target.value as "contains" | "exact")
                  }
                  disabled={
                    includeKeywords.length > 1 || !planFeatures.autoReplyExactMatch
                  }
                >
                  <option value="contains">{t("matchMode.contains")}</option>
                  {planFeatures.autoReplyExactMatch && (
                    <option value="exact">{t("matchMode.exact")}</option>
                  )}
                </Select>
              </div>
            </div>
            )}

            <div className="space-y-1.5">
              <FieldLabel label={t("fields.template")} hint={t("hints.template")} />
              <Select
                value={templateId || ""}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                <option value="">{t("fields.noTemplate")}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                    {resolveImageAssetIds(tpl.imageAssetIds ?? []).length
                      ? " 🖼"
                      : ""}
                  </option>
                ))}
              </Select>
            </div>

            {hasTemplate && selectedTemplate ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <p className="text-caption font-medium text-muted-foreground">
                  {t("templatePreview")}
                </p>
                {resolveImageAssetIds(selectedTemplate.imageAssetIds ?? [])
                  .length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {resolveImageAssetIds(
                      selectedTemplate.imageAssetIds ?? [],
                    ).map((id) => (
                      <img
                        key={id}
                        src={`/api/media/${id}`}
                        alt=""
                        className="h-16 w-16 rounded object-cover"
                      />
                    ))}
                  </div>
                )}
                {selectedTemplate.body ? (
                  <p className="whitespace-pre-wrap text-small">
                    {selectedTemplate.body}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <FieldLabel
                    label={t("fields.replyText")}
                    hint={t("hints.replyText")}
                  />
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    placeholder={t("fields.replyTextHint")}
                  />
                </div>

                {!simpleMode && planFeatures.autoReplyImages && (
                  <div className="space-y-1.5">
                    <FieldLabel
                      label={t("fields.replyImage")}
                      hint={t("hints.replyImage")}
                    />
                    <ImageUploadPreview
                      uploadLabel={t("uploadImage")}
                      removeLabel={t("removeAllImages")}
                      value={replyImageAssetIds}
                      onChange={setReplyImageAssetIds}
                      variant="compact"
                    />
                  </div>
                )}
              </>
            )}

            {!simpleMode && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel
                  label={t("fields.cooldown")}
                  hint={t("hints.cooldown")}
                />
                <Input
                  type="number"
                  min={0}
                  max={planFeatures.autoReplyCooldownMaxSec}
                  value={cooldownSec}
                  onChange={(e) => setCooldownSec(Number(e.target.value))}
                />
              </div>
              {planFeatures.autoReplyPriority && (
                <div className="space-y-1.5">
                  <FieldLabel
                    label={t("fields.priority")}
                    hint={t("hints.priority")}
                  />
                  <Select
                    value={priorityTier}
                    onChange={(e) =>
                      setPriorityTier(e.target.value as PriorityTier)
                    }
                  >
                    {PRIORITY_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {t(`priorityTier.${tier}`)}
                      </option>
                    ))}
                  </Select>
                  <p className="text-caption text-muted-foreground">
                    {t("help.priority")}
                  </p>
                </div>
              )}
            </div>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <FieldLabel label={t("fields.enabled")} hint={t("hints.enabled")} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={save}
              disabled={
                saving || selectedChats.size === 0 || includeKeywords.length === 0
              }
            >
              {saving && <IconLoader className="h-4 w-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("deleteConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmRemove()}
              disabled={deleting}
            >
              {deleting && <IconLoader className="h-4 w-4 animate-spin" />}
              {t("deleteConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        limitType={upgradeLimit}
        trialStarted={trialStarted}
      />
    </>
  );
}
