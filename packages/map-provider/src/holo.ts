/**
 * The holographic look as plain numbers: one cyan accent, one scan band and the opacities of
 * the corridor. Colours are the approved night view. Amber and red are never used here, they
 * belong to warnings and errors only.
 */

/** The cyan accent (design token `accent`). Surfaces, labels and glows. */
export const HOLO_CYAN = "#5fc8e8";
/** The bright cyan for edge lines and rails. */
export const HOLO_CYAN_BRIGHT = "#67e8f9";
/** The fill of the translucent corridor ribbon. */
export const HOLO_RIBBON = "#38bdf8";
/** How opaque the corridor ribbon is. */
export const HOLO_RIBBON_ALPHA = 0.22;
/** Dark glass for building bodies. */
export const HOLO_GLASS = "#04141f";

/** Width of the corridor ribbon on the road, in metres. A scooter lane, not a road. */
export const CORRIDOR_WIDTH_METRES = 3.4;
/** Width of each bright rail along the corridor edges, in metres. */
export const CORRIDOR_RAIL_METRES = 0.22;

/**
 * The scan band: one soft band that sweeps up the picture and then rests, over a fixed period.
 * It is a function of time only, so every provider shows the same slow sweep.
 */
export const SCAN_PERIOD_MS = 9_000;
/** The share of the period spent sweeping. The rest is a quiet pause between sweeps. */
export const SCAN_SWEEP_SHARE = 0.78;

/**
 * Where the scan band is, from 0 at the bottom of the picture to 1 at the top, or a negative
 * number while it rests. Eased in and out, so it does not start or stop with a jolt.
 */
export function scanBandPosition(nowMs: number, periodMs: number = SCAN_PERIOD_MS): number {
  if (!Number.isFinite(nowMs) || periodMs <= 0) return -1;
  const phase = (((nowMs % periodMs) + periodMs) % periodMs) / periodMs;
  if (phase >= SCAN_SWEEP_SHARE) return -1;
  const t = phase / SCAN_SWEEP_SHARE;
  // Smoothstep ease. The band starts a little below the picture and ends a little above it.
  const eased = t * t * (3 - 2 * t);
  return -0.1 + 1.2 * eased;
}

/** A soft pulse from 0 to 1 and back that repeats every `periodMs`. */
export function pulse01(nowMs: number, periodMs: number, offset = 0): number {
  if (!Number.isFinite(nowMs) || periodMs <= 0) return 0;
  const phase = nowMs / periodMs + offset;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
}
