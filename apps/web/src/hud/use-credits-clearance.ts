"use client";

import { useEffect } from "react";

/** The CSS variable that holds how tall the credits strip is, for anything fixed to the bottom. */
export const CREDITS_CLEARANCE_VAR = "--wl-credits-clearance";

/**
 * Publishes the height of the credits strip as `--wl-credits-clearance` on the document root, and
 * keeps it current as the strip grows or shrinks (a long credit line, a rotated phone). The
 * first run safety notice is fixed to the bottom of the screen outside the riding screen's own
 * layout, so it reads this value and sits above the strip. The Google and Cesium credits must
 * never be covered (see docs/ARCHITECTURE.md, "Credits"). The value is removed when the riding
 * screen goes away.
 */
export function useCreditsClearance(strip: HTMLElement | null): void {
  useEffect(() => {
    if (!strip) return undefined;
    const root = document.documentElement;
    const publish = (): void => {
      root.style.setProperty(CREDITS_CLEARANCE_VAR, `${String(Math.ceil(strip.offsetHeight))}px`);
    };
    publish();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(publish);
    observer?.observe(strip);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(CREDITS_CLEARANCE_VAR);
    };
  }, [strip]);
}
