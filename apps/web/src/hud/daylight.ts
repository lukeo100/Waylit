import {
  DEMO_ROUTE,
  daylightFactor,
  getSolarState,
  getSunTimes,
  type LatLng,
  type SolarState,
} from "@waylit/core";

/**
 * The place used for the sun before a trip starts and whenever there is no position: the start
 * of the demo route, in an open public area of Berlin. Real GPS replaces it later.
 */
export const DEFAULT_SUN_POSITION: LatLng = DEMO_ROUTE.path[0] ?? { lat: 52.4709, lng: 13.3995 };

/**
 * How much daylight the rider has, worked out from the sun's real position at the rider's place
 * and the current moment. It is one small, plain value that the HUD, and later the 3D scene's
 * lighting, can both read through `useDaylight()`.
 */
export interface DaylightState {
  /** Where the sun is, and the phase of the day: day, golden hour, twilights or night. */
  readonly solar: SolarState;
  /**
   * Smooth daylight from 0 (dark) to 1 (full day). It follows the sun elevation along a
   * smoothstep curve from -6 degrees (end of civil twilight) to +6 degrees (top of golden hour).
   */
  readonly factor: number;
  /**
   * How warm and low the light is, from 0 to 1. It peaks when the sun is about on the horizon
   * and falls to 0 in full day and in full dark. For tinting a sunrise or sunset.
   */
  readonly warmth: number;
  /** True when the light is more day than night (`factor` of one half or more). */
  readonly isDay: boolean;
  /** The moment this describes, milliseconds since the Unix epoch. */
  readonly nowMs: number;
  /** The place this describes. */
  readonly position: LatLng;
  /** True when a developer time override is in force instead of the real time. */
  readonly overridden: boolean;
}

/** Elevation at which the light is warmest, and how far either side it fades out. */
const WARM_PEAK_DEGREES = -1;
const WARM_SPREAD_DEGREES = 7;

/** The daylight state at a place and moment. */
export function computeDaylight(
  position: LatLng,
  nowMs: number,
  overridden = false,
): DaylightState {
  const solar = getSolarState(position.lat, position.lng, new Date(nowMs));
  const factor = daylightFactor(solar.elevationDegrees);
  const warmth = Math.max(
    0,
    1 - Math.abs(solar.elevationDegrees - WARM_PEAK_DEGREES) / WARM_SPREAD_DEGREES,
  );
  return { solar, factor, warmth, isDay: factor >= 0.5, nowMs, position, overridden };
}

/**
 * The state used before the page has loaded and there is no time yet: full night. The first
 * frame is the darker, quieter one, and the server render matches the first client render.
 */
export function unknownDaylight(position: LatLng): DaylightState {
  return {
    solar: {
      elevationDegrees: -90,
      apparentElevationDegrees: -90,
      azimuthDegrees: 0,
      phase: "night",
      rising: false,
    },
    factor: 0,
    warmth: 0,
    isDay: false,
    nowMs: 0,
    position,
    overridden: false,
  };
}

/**
 * Rounds a position to about 100 metres. The sun hardly moves over that distance, so the
 * daylight state only needs recomputing when the rider has gone further than this.
 */
export function roundPosition(position: LatLng): LatLng {
  return {
    lat: Math.round(position.lat * 1000) / 1000,
    lng: Math.round(position.lng * 1000) / 1000,
  };
}

/** The moments the dev time override can jump to. */
export type TimePreset = "dawn" | "noon" | "sunset" | "night";

export const TIME_PRESETS: readonly TimePreset[] = ["dawn", "noon", "sunset", "night"];

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/**
 * The instant for a time of day preset on the solar day around `dayMs`, at a place:
 * dawn is five minutes after sunrise, noon is solar noon, sunset is five minutes before sunset,
 * and night is solar midnight. In polar day and polar night, where sunrise and sunset do not
 * exist, dawn and sunset fall back to six hours either side of solar noon.
 */
export function presetInstant(preset: TimePreset, position: LatLng, dayMs: number): number {
  const times = getSunTimes(position.lat, position.lng, new Date(dayMs));
  const noon = times.solarNoon.getTime();
  switch (preset) {
    case "dawn":
      return times.sunrise ? times.sunrise.getTime() + 5 * MINUTE_MS : noon - 6 * HOUR_MS;
    case "noon":
      return noon;
    case "sunset":
      return times.sunset ? times.sunset.getTime() - 5 * MINUTE_MS : noon + 6 * HOUR_MS;
    case "night":
      return noon + 12 * HOUR_MS;
  }
}

/** Minutes since midnight in the device's own time zone, 0 to 1439, for an instant. */
export function localMinutesOfDay(ms: number): number {
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Moves an instant to another time of day in the device's own time zone, keeping its date.
 * Used by the dev time slider.
 */
export function withLocalMinutes(ms: number, minutesOfDay: number): number {
  const date = new Date(ms);
  date.setHours(Math.floor(minutesOfDay / 60), Math.round(minutesOfDay % 60), 0, 0);
  return date.getTime();
}

/** `YYYY-MM-DD` in the device's own time zone, for a date input. */
export function localDateString(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Moves an instant to another calendar date (`YYYY-MM-DD`) in the device's own time zone,
 * keeping the time of day. Returns the input if the string is not a date.
 */
export function withLocalDate(ms: number, dateString: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return ms;
  const date = new Date(ms);
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getTime();
}
