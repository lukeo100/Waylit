import { StepDownGovernor, type StepGovernorOptions } from "./step-governor";
import type { HoloItem } from "./types";

/**
 * How much of the hologram a slow phone is asked to draw. The screen effect has its own ladder
 * (`FxGovernor`) and is off by default on Google tiles, so the hologram objects need their own
 * step down that works whatever the fx level is.
 *
 *  - `full`: every chevron and the glowing rails.
 *  - `light`: every second chevron.
 *  - `minimal`: every fourth chevron, and the rails volume is dropped (the ribbon stays).
 *
 * The rider, the heading marker, the beacon and the ribbon are never dropped.
 */
export type HoloDetail = "full" | "light" | "minimal";

export const HOLO_DETAILS: readonly HoloDetail[] = ["full", "light", "minimal"];

/** The next cheaper detail level, or undefined when already minimal. */
export function cheaperDetail(detail: HoloDetail): HoloDetail | undefined {
  if (detail === "full") return "light";
  if (detail === "light") return "minimal";
  return undefined;
}

export interface HoloDetailSettings {
  /** Draw a chevron only when its slot number divides by this. 1 draws all. */
  readonly chevronStride: number;
  /** Whether the glowing rails volume exists. */
  readonly rails: boolean;
}

export function holoDetailSettings(detail: HoloDetail): HoloDetailSettings {
  switch (detail) {
    case "full":
      return { chevronStride: 1, rails: true };
    case "light":
      return { chevronStride: 2, rails: true };
    case "minimal":
      return { chevronStride: 4, rails: false };
  }
}

/**
 * Whether an item is drawn at a detail level. Chevrons are thinned by their slot number, which
 * is fixed along the route, so the same chevron stays or goes and nothing flickers as the rider
 * moves. Every other kind is always drawn.
 */
export function holoItemDrawn(item: HoloItem, detail: HoloDetail): boolean {
  if (item.kind !== "chevron") return true;
  return (item.slot ?? 0) % holoDetailSettings(detail).chevronStride === 0;
}

/** Steps the hologram detail down when the median frame rate is below 30 fps. */
export class HoloGovernor extends StepDownGovernor<HoloDetail> {
  constructor(initial: HoloDetail = "full", options: StepGovernorOptions = {}) {
    super(initial, cheaperDetail, options);
  }
}
