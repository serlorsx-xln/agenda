"use client";

import * as React from "react";
import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function FieldHint({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const tc = useTranslations("common");

  if (!content) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 rounded-full text-muted-foreground hover:text-foreground",
            className,
          )}
          aria-label={tc("moreInfo")}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}

export function FieldLabel({
  htmlFor,
  label,
  hint,
  className,
}: {
  htmlFor?: string;
  label: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint ? <FieldHint content={hint} /> : null}
    </div>
  );
}
