import type { BeaconState } from "@waylit/map-provider";

/**
 * The distance countdown that stands over the turn beacon, for example an arrow and "120 m".
 * Plain DOM, drawn over the scene (not over the credits strip, which is outside the scene
 * element). Both providers use it: they work out where the top of the light column is on the
 * screen and call `update`. It is hidden from assistive technology because the HUD already
 * announces the next turn and its distance.
 */

const ARROWS: Record<BeaconState["direction"], string> = {
  left: "M17 12H7m5-5-5 5 5 5",
  right: "M7 12h10m-5-5 5 5-5 5",
  "u-turn": "M8 19V10a4 4 0 0 1 8 0v3m-3-2 3 3 3-3",
  roundabout: "M12 5a7 7 0 1 0 7 7m-3-3 3 3 3-3",
  arrive: "M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10Zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
};

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Where the label may sit, as a share of the scene's width and height. The top limit keeps it
 * from sliding under the top HUD (the turn arrow and distance, the clock and the minimap).
 */
export const LABEL_BOUNDS = { minX: 0.1, maxX: 0.9, minY: 0.28, maxY: 0.62 } as const;

/** Keeps the label where it can be read: off the very top and bottom, and inside the sides. */
export function clampLabel(
  point: ScreenPoint,
  width: number,
  height: number,
): ScreenPoint | undefined {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || width <= 0 || height <= 0) {
    return undefined;
  }
  return {
    x: Math.min(width * LABEL_BOUNDS.maxX, Math.max(width * LABEL_BOUNDS.minX, point.x)),
    y: Math.min(height * LABEL_BOUNDS.maxY, Math.max(height * LABEL_BOUNDS.minY, point.y)),
  };
}

export class BeaconLabel {
  private readonly root: HTMLDivElement;
  private readonly arrow: SVGPathElement;
  private readonly value: HTMLSpanElement;
  private readonly unit: HTMLSpanElement;
  private shown = false;
  private lastText = "";
  private lastDirection: string | undefined;

  constructor(private readonly container: HTMLElement) {
    const root = document.createElement("div");
    root.className = "wl-beacon";
    root.setAttribute("aria-hidden", "true");
    root.dataset["testid"] = "beacon-label";
    root.style.opacity = "0";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "wl-beacon-arrow");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.append(path);

    const value = document.createElement("span");
    value.className = "wl-beacon-value";
    const unit = document.createElement("span");
    unit.className = "wl-beacon-unit";
    root.append(svg, value, unit);
    container.append(root);

    this.root = root;
    this.arrow = path;
    this.value = value;
    this.unit = unit;
  }

  /** Shows the label at a point (in CSS pixels from the top left of the scene) or hides it. */
  update(point: ScreenPoint | undefined, beacon: BeaconState | undefined): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const spot = point && beacon ? clampLabel(point, width, height) : undefined;
    if (!spot || !beacon) {
      this.hide();
      return;
    }
    if (beacon.direction !== this.lastDirection) {
      this.arrow.setAttribute("d", ARROWS[beacon.direction]);
      this.lastDirection = beacon.direction;
    }
    if (beacon.label !== this.lastText) {
      const [value, ...unit] = beacon.label.split(" ");
      this.value.textContent = value ?? "";
      this.unit.textContent = unit.join(" ");
      this.lastText = beacon.label;
    }
    this.root.dataset["phase"] = beacon.phase;
    this.root.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px) translate(-50%, -100%)`;
    if (!this.shown) {
      this.root.style.opacity = "1";
      this.shown = true;
    }
  }

  hide(): void {
    if (!this.shown) return;
    this.root.style.opacity = "0";
    this.shown = false;
  }

  destroy(): void {
    this.root.remove();
  }
}

/**
 * A transparent layer over the scene that holds overlays such as the beacon label. It never
 * takes pointer events and clips its content, and it sits inside the scene element, so it can
 * never reach the credits strip.
 */
export function createOverlay(scene: HTMLElement): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "wl-scene-overlay";
  overlay.setAttribute("aria-hidden", "true");
  scene.append(overlay);
  return overlay;
}
