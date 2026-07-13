"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw } from "lucide-react";
import { IconPlus } from "@/lib/icons";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { addTargetToCampaign } from "@/app/(dashboard)/dashboard/campaigns/actions";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
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
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PlanUsageSnapshot } from "@/lib/plan-usage-types";
import { Badge } from "@/components/ui/badge";
import { FieldHint } from "@/components/ui/field-hint";

type Chat = {
  id: string;
  chatMid: string;
  name: string;
  kind: "square" | "group";
  memberCount: number | null;
  present: boolean;
  lastSeenAt: string | Date;
};

type CampaignOption = { id: string; name: string };

export function OpenChatsClient({
  chats,
  campaigns,
  connected,
  planUsage: _planUsage,
}: {
  chats: Chat[];
  campaigns: CampaignOption[];
  connected: boolean;
  planUsage: PlanUsageSnapshot;
}) {
  const t = useTranslations("openchats");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [syncing, setSyncing] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [dialogChat, setDialogChat] = React.useState<Chat | null>(null);
  const [selectedCampaign, setSelectedCampaign] = React.useState<string>(
    campaigns[0]?.id ?? "",
  );
  const [adding, setAdding] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);

  async function handleSync() {
    setSyncing(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch("/api/line/sync", {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("sync_failed");
      toast.success(tt("synced"));
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      window.clearTimeout(timer);
      setSyncing(false);
    }
  }

  async function copyMid(mid: string) {
    try {
      await navigator.clipboard.writeText(mid);
      setCopied(mid);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error(tt("error"));
    }
  }

  async function handleAddTarget() {
    if (!dialogChat || !selectedCampaign) return;
    setAdding(true);
    try {
      const res = await addTargetToCampaign(
        selectedCampaign,
        dialogChat.chatMid,
      );
      if (!res.ok) {
        if (res.error === "plan_limit_targets") {
          setUpgradeOpen(true);
        } else {
          throw new Error(res.error);
        }
        return;
      }
      toast.success(tt("targetAdded"));
      setDialogChat(null);
    } catch {
      toast.error(tt("error"));
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={handleSync} disabled={syncing || !connected}>
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {syncing ? t("syncing") : t("sync")}
        </Button>
      </div>

      {!connected ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-small text-muted-foreground">{t("notConnected")}</p>
            <Button asChild size="touch">
              <Link href="/dashboard/connect">{t("emptyCta")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : chats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-small text-muted-foreground">{t("empty")}</p>
            <Button onClick={handleSync} disabled={syncing} size="touch">
              <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {syncing ? t("syncing") : t("sync")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="grid gap-3 md:hidden">
            {chats.map((chat) => (
              <Card key={chat.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{chat.name}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="muted">
                          {chat.kind === "group"
                            ? t("kind.group")
                            : t("kind.square")}
                        </Badge>
                        <Badge variant={chat.present ? "success" : "muted"}>
                          {chat.present ? t("present") : t("missing")}
                        </Badge>
                      </div>
                    </div>
                    {chat.memberCount != null && (
                      <span className="shrink-0 text-caption text-muted-foreground">
                        {chat.memberCount} {t("columns.members").toLowerCase()}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyMid(chat.chatMid)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-caption text-muted-foreground"
                  >
                    {copied === chat.chatMid ? (
                      <Check className="h-4 w-4 shrink-0" />
                    ) : (
                      <Copy className="h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate">{chat.chatMid}</span>
                  </button>
                  <Button
                    variant="outline"
                    size="touch"
                    className="w-full"
                    onClick={() => {
                      setDialogChat(chat);
                      setSelectedCampaign(campaigns[0]?.id ?? "");
                    }}
                    disabled={!chat.present}
                  >
                    <IconPlus className="h-4 w-4" />
                    {t("addTarget")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("columns.type")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <span className="inline-flex items-center gap-1">
                      {t("columns.mid")}
                      <FieldHint content={t("hints.mid")} />
                    </span>
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("columns.members")}
                  </TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {chats.map((chat) => (
                  <TableRow key={chat.id}>
                    <TableCell className="font-medium">{chat.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="muted">
                        {chat.kind === "group"
                          ? t("kind.group")
                          : t("kind.square")}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <button
                        type="button"
                        onClick={() => copyMid(chat.chatMid)}
                        className="inline-flex items-center gap-1.5 font-mono text-caption text-muted-foreground hover:text-foreground"
                      >
                        {copied === chat.chatMid ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span className="max-w-[160px] truncate">
                          {chat.chatMid}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {chat.memberCount ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={chat.present ? "success" : "muted"}>
                        {chat.present ? t("present") : t("missing")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDialogChat(chat);
                          setSelectedCampaign(campaigns[0]?.id ?? "");
                        }}
                        disabled={!chat.present}
                      >
                        <IconPlus className="h-3.5 w-3.5" />
                        {t("addTarget")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>
      )}

      <Dialog
        open={!!dialogChat}
        onOpenChange={(open) => !open && setDialogChat(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addTargetDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("addTargetDialog.description")}
            </DialogDescription>
          </DialogHeader>
          {campaigns.length === 0 ? (
            <p className="text-small text-muted-foreground">
              {t("addTargetDialog.noCampaigns")}
            </p>
          ) : (
            <Select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <DialogFooter>
            <Button
              onClick={handleAddTarget}
              disabled={adding || campaigns.length === 0}
            >
              {t("addTargetDialog.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        limitType="targets"
      />
    </>
  );
}
