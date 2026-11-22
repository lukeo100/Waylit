/**
 * The simulation dev controls (playback speed and a telemetry loss switch) are for developers
 * and for demonstrating the GPS fallback. They show in development builds. In a production
 * build they stay hidden unless the address has `?dev=1`.
 */
export function devControlsEnabled(search: string, nodeEnv: string | undefined): boolean {
  if (nodeEnv !== "production") return true;
  return new URLSearchParams(search).get("dev") === "1";
}

/** Playback speeds offered by the dev controls. */
export const PLAYBACK_SPEEDS: readonly number[] = [1, 2, 4, 8];
