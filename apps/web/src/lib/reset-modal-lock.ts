type ResetModalLockOptions = {
  /** Remove dialog portal nodes left behind after client navigation. */
  removeOrphanOverlays?: boolean;
};

function isDialogPortal(node: HTMLElement): boolean {
  return Boolean(
    node.querySelector("[role='dialog']") ||
      node.querySelector(".fixed.inset-0"),
  );
}

/** Clear Radix Dialog / scroll-lock leftovers that block clicks after route changes. */
export function resetModalLock(options: ResetModalLockOptions = {}): void {
  if (typeof document === "undefined") return;

  const { removeOrphanOverlays = false } = options;

  document.body.style.removeProperty("pointer-events");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  document.body.removeAttribute("data-scroll-locked");

  document.documentElement.style.removeProperty("overflow");
  document.documentElement.removeAttribute("data-scroll-locked");

  for (const el of document.querySelectorAll("[data-aria-hidden]")) {
    el.removeAttribute("aria-hidden");
    el.removeAttribute("data-aria-hidden");
  }

  if (!removeOrphanOverlays) return;

  for (const child of [...document.body.children]) {
    if (!(child instanceof HTMLElement) || !isDialogPortal(child)) continue;

    const hasOpenSurface = child.querySelector('[data-state="open"]');
    if (!hasOpenSurface) {
      child.remove();
    }
  }
}

/** Drop every dialog portal - safe after route changes once sheets are closed. */
export function removeDialogPortals(): void {
  if (typeof document === "undefined") return;

  for (const child of [...document.body.children]) {
    if (child instanceof HTMLElement && isDialogPortal(child)) {
      child.remove();
    }
  }
}
