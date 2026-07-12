"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import {
  removeDialogPortals,
  resetModalLock,
} from "@/lib/reset-modal-lock";

/** Reset stuck modal overlays whenever the route changes. */
export function NavigationReset() {
  const pathname = usePathname();

  React.useEffect(() => {
    resetModalLock({ removeOrphanOverlays: true });
    removeDialogPortals();
  }, [pathname]);

  React.useEffect(() => {
    resetModalLock({ removeOrphanOverlays: true });
  }, []);

  return null;
}
