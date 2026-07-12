"use client";

import * as React from "react";
import { ImageIcon, Loader2, X } from "lucide-react";

import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import type { UpgradeLimitType } from "@/lib/plan-usage-types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_UPLOAD_IMAGES = 10;

async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/media/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "upload_failed");
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function deleteMediaAsset(id: string): Promise<void> {
  const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "delete_failed");
  }
}

type PendingUpload = {
  key: string;
  previewUrl: string;
  fileName: string;
};

type ImageUploadPreviewProps = {
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  uploadLabel?: string;
  removeLabel?: string;
  maxImages?: number;
  className?: string;
  /** Compact grid for inline forms */
  variant?: "default" | "compact";
};

export function ImageUploadPreview({
  value,
  onChange,
  label,
  uploadLabel,
  removeLabel,
  maxImages = MAX_UPLOAD_IMAGES,
  className,
  variant = "default",
}: ImageUploadPreviewProps) {
  const [uploading, setUploading] = React.useState(false);
  const [pending, setPending] = React.useState<PendingUpload[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);

  React.useEffect(() => {
    return () => {
      for (const p of pending) {
        URL.revokeObjectURL(p.previewUrl);
      }
    };
  }, [pending]);

  async function onFilesPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;

    const remaining = maxImages - value.length - pending.length;
    if (remaining <= 0) return;

    const batch = files.slice(0, remaining);
    const nextPending: PendingUpload[] = batch.map((file) => ({
      key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      previewUrl: URL.createObjectURL(file),
      fileName: file.name,
    }));
    setPending((prev) => [...prev, ...nextPending]);
    setUploading(true);
    setError(null);

    try {
      const uploaded: string[] = [];
      for (let i = 0; i < batch.length; i++) {
        const id = await uploadImage(batch[i]!);
        uploaded.push(id);
        URL.revokeObjectURL(nextPending[i]!.previewUrl);
      }
      setPending((prev) =>
        prev.filter((p) => !nextPending.some((n) => n.key === p.key)),
      );
      onChange([...value, ...uploaded].slice(0, maxImages));
    } catch (err) {
      for (const p of nextPending) {
        URL.revokeObjectURL(p.previewUrl);
      }
      setPending((prev) =>
        prev.filter((p) => !nextPending.some((n) => n.key === p.key)),
      );
      setError(err instanceof Error ? err.message : "upload_failed");
      if (
        err instanceof Error &&
        err.message === "plan_limit_media_assets"
      ) {
        setUpgradeOpen(true);
      }
    } finally {
      setUploading(false);
    }
  }

  function removeAt(index: number) {
    const id = value[index];
    if (!id) return;
    onChange(value.filter((_, i) => i !== index));
    void deleteMediaAsset(id).catch((err) => {
      setError(err instanceof Error ? err.message : "delete_failed");
    });
  }

  function clearAll() {
    const ids = [...value];
    onChange([]);
    if (ids.length === 0) return;
    void Promise.all(ids.map((id) => deleteMediaAsset(id))).catch((err) => {
      setError(err instanceof Error ? err.message : "delete_failed");
    });
  }

  const totalCount = value.length + pending.length;
  const canAddMore = totalCount < maxImages;
  const gridClass =
    variant === "compact"
      ? "grid grid-cols-3 gap-2 sm:grid-cols-4"
      : "grid grid-cols-2 gap-2 sm:grid-cols-3";

  return (
    <div className={cn("space-y-2", className)}>
      {label ? <Label>{label}</Label> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={uploading || !canAddMore}
          asChild
        >
          <label className="cursor-pointer">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            {uploadLabel ?? "Upload images"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={onFilesPick}
              disabled={uploading || !canAddMore}
            />
          </label>
        </Button>
        {value.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            {removeLabel ?? "Clear all"}
          </Button>
        )}
        {totalCount > 0 && (
          <span className="text-caption text-muted-foreground">
            {totalCount}/{maxImages}
          </span>
        )}
      </div>
      {error ? (
        <p className="text-caption text-destructive">{error}</p>
      ) : null}
      {(value.length > 0 || pending.length > 0) && (
        <div className={gridClass}>
          {value.map((id, index) => (
            <div
              key={id}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/30"
            >
              <img
                src={`/api/media/${id}`}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => removeAt(index)}
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {pending.map((p) => (
            <div
              key={p.key}
              className="relative aspect-square overflow-hidden rounded-md border border-dashed border-border bg-muted/20"
            >
              <img
                src={p.previewUrl}
                alt=""
                className="h-full w-full object-cover opacity-70"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        limitType={"media_assets" satisfies UpgradeLimitType}
      />
    </div>
  );
}
