import type { LatLng } from "@waylit/core";
import { TIME_PRESETS, presetInstant } from "./daylight";

/**
 * The simulation dev controls (playback speed, a telemetry loss switch and the time of day
 * override) are for developers and for demonstrating the GPS fallback and the day and night
 * look. They show in development builds. In a production build they stay hidden unless the
 * address has `?dev=1`.
 */
export function devControlsEnabled(search: string, nodeEnv: string | undefined): boolean {
  if (nodeEnv !== "production") return true;
  return new URLSearchParams(search).get("dev") === "1";
}

/** Playback speeds offered by the dev controls. */
export const PLAYBACK_SPEEDS: readonly number[] = [1, 2, 4, 8];

/**
 * Reads a time override from the address, so a demo or a screenshot can open straight at a
 * moment: `?dev=1&time=sunset` (one of dawn, noon, sunset or night, on today's date at the
 * rider's place) or `?dev=1&time=2026-06-21T20:30:00Z` (any date and time with an offset).
 * Returns undefined when there is none or it cannot be read. Only used while the dev controls
 * are on.
 */
export function parseTimeOverride(
  search: string,
  position: LatLng,
  realNowMs: number | undefined,
): number | undefined {
  // A bare "+" in an address reads back as a space, so put it back.
  const value = new URLSearchParams(search).get("time")?.replace(" ", "+");
  if (value === undefined) return undefined;
  const preset = TIME_PRESETS.find((name) => name === value);
  if (preset !== undefined) {
    return realNowMs === undefined ? undefined : presetInstant(preset, position, realNowMs);
  }
  // Only a date and time with an explicit offset, so the result never depends on the device zone.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
