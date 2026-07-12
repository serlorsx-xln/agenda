"use client";

import * as React from "react";
import Link from "next/link";

import { resetModalLock } from "@/lib/reset-modal-lock";
import { cn } from "@/lib/utils";

type DashboardNavLinkProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
  onNavigate?: () => void;
};

export function DashboardNavLink({
  href,
  className,
  children,
  onNavigate,
}: DashboardNavLinkProps) {
  function prepareNavigation() {
    resetModalLock({ removeOrphanOverlays: true });
  }

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    prepareNavigation();
    onNavigate?.();

    const modified =
      e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
    if (modified) return;

    // Hard fallback only when scroll-lock/overlay is still blocking clicks.
    const stillBlocked =
      document.body.style.pointerEvents === "none" ||
      Boolean(
        document.querySelector(
          'body > div .fixed.inset-0[data-state="open"]',
        ),
      );

    if (stillBlocked) {
      e.preventDefault();
      window.location.assign(href);
    }
  }

  return (
    <Link
      href={href}
      onPointerDown={prepareNavigation}
      onClick={handleClick}
      className={cn("pointer-events-auto", className)}
    >
      {children}
    </Link>
  );
}
