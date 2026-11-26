import {
  fxLevelIsFromAddress,
  parseFxLevel,
  parseMapChoice,
  resolveFxLevel,
  selectProvider,
  type FxLevel,
  type MapChoice,
  type ProviderSelection,
} from "@waylit/map-provider";

/**
 * The rider's map settings: which map to show and how strong the hologram screen effect is.
 * They live in localStorage (the choice is only a preference, so a blocked store just means it is
 * not remembered) and the address still wins when it has `?map=` or `?fx=`. Pure functions and a
 * small store, so they run in tests with no browser.
 */

/** Where the rider's position comes from. `replay` is a generated trace for desks (`?gps=replay`). */
export type GpsChoice = "sim" | "live" | "replay";

/** The value of `?gps=` in the address: `sim`, `live` or `replay`. */
export function parseGpsChoice(search: string): GpsChoice | undefined {
  const value = new URLSearchParams(search).get("gps")?.trim().toLowerCase();
  return value === "sim" || value === "live" || value === "replay" ? value : undefined;
}

/** True for the sources that have no route near the rider, so the scene is a free ride. */
export function isFreeRide(gps: GpsChoice): boolean {
  return gps !== "sim";
}

/** The lowest and highest ground height the settings accept, in metres above the ellipsoid. */
export const GROUND_RANGE_METRES = { min: -100, max: 3000 } as const;

export interface MapSettings {
  /** The rider's choice of map. Undefined means they never chose, so the defaults apply. */
  readonly map?: MapChoice;
  /** The rider's choice of effect level. Undefined means the provider's default. */
  readonly fx?: FxLevel;
  /** The rider's choice of position source. Undefined means the simulator. */
  readonly gps?: "sim" | "live";
  /**
   * Ground height in metres above the WGS84 ellipsoid, for Google tiles with live GPS until the
   * phone gives a reliable altitude. Undefined means the demo route's constant.
   */
  readonly groundMetres?: number | undefined;
}

export const MAP_SETTINGS_STORAGE_KEY = "waylit:map-settings:v1";

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Reads stored settings. Anything unreadable or unknown is dropped, never an error. */
export function parseMapSettings(raw: string | null | undefined): MapSettings {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return {};
    const record = value as Record<string, unknown>;
    const map =
      typeof record["map"] === "string" ? parseMapChoice(`?map=${record["map"]}`) : undefined;
    const fx = typeof record["fx"] === "string" ? parseFxLevel(record["fx"]) : undefined;
    const gps = record["gps"] === "sim" || record["gps"] === "live" ? record["gps"] : undefined;
    const ground = record["groundMetres"];
    const groundMetres =
      typeof ground === "number" &&
      Number.isFinite(ground) &&
      ground >= GROUND_RANGE_METRES.min &&
      ground <= GROUND_RANGE_METRES.max
        ? ground
        : undefined;
    return {
      ...(map ? { map } : {}),
      ...(fx ? { fx } : {}),
      ...(gps ? { gps } : {}),
      ...(groundMetres !== undefined ? { groundMetres } : {}),
    };
  } catch {
    return {};
  }
}

export function readMapSettings(storage: SettingsStorage | null): MapSettings {
  try {
    return parseMapSettings(storage?.getItem(MAP_SETTINGS_STORAGE_KEY));
  } catch {
    return {};
  }
}

export interface MapSettingsStore {
  /** The stored settings. The same object until something changes. */
  get(): MapSettings;
  set(patch: MapSettings): void;
  subscribe(listener: () => void): () => void;
}

export function createMapSettingsStore(getStorage: () => SettingsStorage | null): MapSettingsStore {
  const listeners = new Set<() => void>();
  let current: MapSettings | undefined;
  return {
    get() {
      current ??= readMapSettings(getStorage());
      return current;
    },
    set(patch) {
      current = { ...(current ?? readMapSettings(getStorage())), ...patch };
      try {
        getStorage()?.setItem(MAP_SETTINGS_STORAGE_KEY, JSON.stringify(current));
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

export interface MapSettingsModelInput {
  readonly search: string;
  readonly token: string | undefined;
  readonly nodeEnv: string | undefined;
  readonly settings: MapSettings;
}

/** What the settings sheet shows, worked out from the address, the token and the saved choice. */
export interface MapSettingsModel {
  /** The provider selection the scene uses. */
  readonly selection: ProviderSelection;
  /** Which map is showing, as the sheet names it. */
  readonly map: MapChoice;
  /** The effect level in force. */
  readonly fx: FxLevel;
  /** False when the build has no Cesium ion token, so Google tiles cannot be chosen. */
  readonly googleAvailable: boolean;
  /** True when `?map=` in the address decides the map, so the sheet cannot change it. */
  readonly mapLockedByAddress: boolean;
  /** True when `?fx=` in the address decides the level, so the sheet cannot change it. */
  readonly fxLockedByAddress: boolean;
  /** The position source in force. The address beats the saved choice, and the default is `sim`. */
  readonly gps: GpsChoice;
  readonly gpsLockedByAddress: boolean;
  /** True for live GPS or a replay: a free ride with no route. */
  readonly freeRide: boolean;
}

export function mapSettingsModel(input: MapSettingsModelInput): MapSettingsModel {
  const selection = selectProvider({
    search: input.search,
    token: input.token,
    nodeEnv: input.nodeEnv,
    preference: input.settings.map,
  });
  const addressGps = parseGpsChoice(input.search);
  const gps: GpsChoice = addressGps ?? input.settings.gps ?? "sim";
  return {
    selection,
    map: selection.id === "cesium-google" ? "cesium" : "fallback",
    fx: resolveFxLevel(input.search, selection.id, input.settings.fx),
    googleAvailable: (input.token?.trim() ?? "") !== "",
    mapLockedByAddress: parseMapChoice(input.search) !== undefined,
    fxLockedByAddress: fxLevelIsFromAddress(input.search),
    gps,
    gpsLockedByAddress: addressGps !== undefined,
    freeRide: isFreeRide(gps),
  };
}

/** Words for the sheet. Plain, and no raw errors. */
export const MAP_SETTINGS_TEXT = {
  title: "Settings",
  mapLabel: "Map",
  googleOption: "Google 3D tiles",
  fallbackOption: "Fallback map",
  fxLabel: "Hologram screen effect",
  fxHint: "A scan band and a ground grid over the scene. Off by default on Google tiles.",
  quota:
    "Google 3D tiles use Cesium ion requests, about 1,000 root requests per month on the Community plan. Each switch to Google uses one.",
  noToken:
    "Google 3D tiles need a Cesium ion token, and this build has none, so the fallback map is used.",
  gpsLabel: "Position",
  gpsSimOption: "Simulator",
  gpsLiveOption: "Phone GPS",
  gpsHintSim: "A simulated ride on the demo route, with turn guidance.",
  gpsHintLive:
    "A free ride on your real position: no route or turns. Waylit asks your browser for your location when you start a trip. It stays on this device and is never stored or sent.",
  gpsHintReplay: "A generated trace is playing instead of your location (?gps=replay).",
  gpsLocked: "The address sets the position (?gps=). Remove it to change it here.",
  gpsBusy: "Change the position source before you start a trip.",
  groundLabel: "Ground height (m)",
  groundHint:
    "Google tiles with Phone GPS only. Metres above the WGS84 ellipsoid, used until your phone gives a reliable altitude. Leave blank for the demo value, which is only right for Berlin.",
  mapLocked: "The address sets the map (?map=). Remove it to change the map here.",
  fxLocked: "The address sets the effect (?fx=). Remove it to change it here.",
} as const;

/** The sheet closes by itself the moment the speed guard turns on, so it can never stay open. */
export function sheetShouldClose(open: boolean, guarded: boolean): boolean {
  return open && guarded;
}
