"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { IconDelete, IconEdit, IconLoader, IconPlus } from "@/lib/icons";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
} from "@/app/(dashboard)/dashboard/templates/actions";
import { ImageUploadPreview } from "@/components/media/image-upload-preview";
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
import { FieldLabel } from "@/components/ui/field-hint";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resolveActionError } from "@/lib/action-errors";
import { resolveImageAssetIds } from "@line/shared/image-assets";

type Template = {
  id: string;
  name: string;
  body: string | null;
  imageAssetIds?: string[];
};

export function TemplatesClient({
  templates,
  promptForCampaign = false,
}: {
  templates: Template[];
  promptForCampaign?: boolean;
}) {
  const t = useTranslations("templates");
  const te = useTranslations("templates.errors");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const router = useRouter();

  const [open, setOpen] = React.useState(promptForCampaign);
  const [editing, setEditing] = React.useState<Template | null>(null);
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [imageAssetIds, setImageAssetIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function openNew() {
    setEditing(null);
    setName("");
    setBody("");
    setImageAssetIds([]);
    setOpen(true);
  }

  function openEdit(tpl: Template) {
    setEditing(tpl);
    setName(tpl.name);
    setBody(tpl.body ?? "");
    setImageAssetIds(
      resolveImageAssetIds(tpl.imageAssetIds ?? []),
    );
    setOpen(true);
  }

  async function save() {
    if (!name.trim()) return;
    if (!body.trim() && imageAssetIds.length === 0) {
      toast.error(t("contentRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        body: body.trim() || null,
                imageAssetIds,
      };
      const res = editing
        ? await updateTemplate({ id: editing.id, ...payload })
        : await createTemplate(payload);
      if (!res.ok) throw new Error(res.error);
      toast.success(editing ? tt("saved") : tt("created"));
      setOpen(false);
      if (!editing && promptForCampaign) {
        router.push("/dashboard/campaigns?new=1");
        router.refresh();
        return;
      }
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(resolveActionError(te, msg, tt("error")));
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteTemplate(deleteTarget);
      if (!res.ok) throw new Error(res.error);
      toast.success(tt("deleted"));
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(resolveActionError(te, msg, tt("error")));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {promptForCampaign ? (
        <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-small text-muted-foreground">
          {t("needForCampaign")}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <IconPlus className="h-4 w-4" />
          {t("new")}
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-small text-muted-foreground">{t("empty")}</p>
            <Button onClick={openNew} size="touch">
              <IconPlus className="h-4 w-4" />
              {t("emptyCta")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((tpl) => {
            const ids = resolveImageAssetIds(tpl.imageAssetIds ?? []);
            return (
              <Card key={tpl.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-h3 font-bold">{tpl.name}</h3>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(tpl)}
                        aria-label={tc("edit")}
                      >
                        <IconEdit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(tpl.id)}
                        aria-label={tc("delete")}
                      >
                        <IconDelete className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {ids.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-1">
                      {ids.slice(0, 3).map((id) => (

                        <img
                          key={id}
                          src={`/api/media/${id}`}
                          alt=""
                          className="aspect-square rounded object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {ids.length > 3 && (
                    <p className="mt-1 text-caption text-muted-foreground">
                      {t("moreImages", { count: ids.length - 3 })}
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-small text-muted-foreground line-clamp-4">
                    {tpl.body || (
                      <span className="italic">{t("imageOnly")}</span>
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? t("edit") : t("new")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">{t("fields.name")}</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="tpl-body"
                  label={t("fields.body")}
                  hint={t("hints.body")}
                />
                <Textarea
                  id="tpl-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t("bodyPlaceholder")}
                  rows={6}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel label={t("fields.image")} hint={t("hints.image")} />
                <ImageUploadPreview
                  uploadLabel={t("uploadImage")}
                  removeLabel={t("removeAllImages")}
                  value={imageAssetIds}
                  onChange={setImageAssetIds}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={save} disabled={saving}>
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
            <DialogTitle>{tc("delete")}</DialogTitle>
            <DialogDescription>{t("deleteConfirm")}</DialogDescription>
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
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
