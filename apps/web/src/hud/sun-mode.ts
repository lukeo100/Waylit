import { parseSunClockMode, type PositionSource, type SunClockMode } from "@waylit/core";

/**
 * Where the rider's position comes from. The demo route is simulated, so the sun follows the
 * device clock by default (see `sunMoment` in `@waylit/core`). When real GPS is added, change
 * this one constant to `"gps"` and the real position and real time are used with no mapping.
 */
export const POSITION_SOURCE: PositionSource = "simulated";

export const DEFAULT_SUN_MODE: SunClockMode = "follow-clock";

export const SUN_MODE_STORAGE_KEY = "waylit:sun-mode:v1";

export interface SunModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The mode to start in: `?sun=clock` or `?sun=real` in the address wins, then the rider's last
 * choice from storage, then "follow my clock".
 */
export function initialSunMode(search: string, storage: SunModeStorage | null): SunClockMode {
  const fromAddress = parseSunClockMode(new URLSearchParams(search).get("sun"));
  if (fromAddress) return fromAddress;
  try {
    return parseSunClockMode(storage?.getItem(SUN_MODE_STORAGE_KEY)) ?? DEFAULT_SUN_MODE;
  } catch {
    return DEFAULT_SUN_MODE;
  }
}

/** Words for the switch on the start screen. */
export const SUN_MODE_LABEL: Record<SunClockMode, string> = {
  "follow-clock": "Light follows my clock",
  "real-sun": "Real sun at the route",
};

export function otherSunMode(mode: SunClockMode): SunClockMode {
  return mode === "follow-clock" ? "real-sun" : "follow-clock";
}

export interface SunModeStore {
  get(): SunClockMode;
  set(mode: SunClockMode): void;
  subscribe(listener: () => void): () => void;
}

/** A small store for the mode, so a tap on the switch reaches the page and is remembered. */
export function createSunModeStore(
  getSearch: () => string,
  getStorage: () => SunModeStorage | null,
): SunModeStore {
  const listeners = new Set<() => void>();
  let chosen: SunClockMode | undefined;
  return {
    get: () => chosen ?? initialSunMode(getSearch(), getStorage()),
    set(mode) {
      chosen = mode;
      try {
        getStorage()?.setItem(SUN_MODE_STORAGE_KEY, mode);
      } catch {
        // Storage can be blocked. The choice still holds for this page.
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
