"use client";

import { useEffect } from "react";

/**
 * The distance from the bottom of the screen up to the top of an element, in pixels. The HUD
 * publishes it for the dock and for the centre group (start prompt), so the settings sheet, which
 * is a fixed panel on the right, can stop above them instead of covering the dock's vehicle
 * stats, End trip or the start prompt's light switch.
 */
export function clearanceBelow(top: number, viewportHeight: number): number {
  return Math.max(0, Math.ceil(viewportHeight - top));
}

/**
 * Publishes `clearanceBelow` for `element` as a CSS variable on the document root, and keeps it
 * current when the element or the window changes size. The value is removed when the element goes
 * away (an empty centre group publishes nothing).
 */
export function useClearanceVar(element: HTMLElement | null, name: string): void {
  useEffect(() => {
    if (!element) return undefined;
    const root = document.documentElement;
    const publish = (): void => {
      root.style.setProperty(
        name,
        `${String(clearanceBelow(element.getBoundingClientRect().top, window.innerHeight))}px`,
      );
    };
    publish();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(publish);
    observer?.observe(element);
    window.addEventListener("resize", publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty(name);
    };
  }, [element, name]);
}

/** The CSS variables the sheet reads, besides the credits strip. */
export const DOCK_CLEARANCE_VAR = "--wl-dock-clearance";
export const CENTRE_CLEARANCE_VAR = "--wl-centre-clearance";
