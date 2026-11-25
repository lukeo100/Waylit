import { getSunTimes } from "./solar";
import type { LatLng } from "./types";

/**
 * Which moment the sun is worked out for. Pure maths, no DOM, no clock of its own.
 *
 * The simulated ride is always in the same place (the demo route in Berlin), but the person
 * testing it may be anywhere. Showing the real Berlin sun to someone in Melbourne at night makes
 * a bright blue sky under a 22:04 HUD clock. So while the position is simulated, the default is
 * to follow the device clock: the scene shows the sun the route would have when the local solar
 * time there is the same as the time on the device's clock. 12:00 on the device is solar noon at
 * the route, 22:04 on the device is deep night there, and so on, whatever the device's time zone.
 *
 *   "follow-clock"  (default while the position is simulated) the device's local time of day,
 *                   on the device's date, read as local solar time at the position.
 *   "real-sun"      the real sun at the position right now, whatever the device clock says.
 *
 * The time of day on the HUD is never changed by this: it keeps showing the device's own clock.
 * A developer time override (dawn, noon, sunset or night) is a real instant at the position and
 * always wins over both modes, so callers apply it before calling anything here.
 */
export type SunClockMode = "follow-clock" | "real-sun";

export const SUN_CLOCK_MODES: readonly SunClockMode[] = ["follow-clock", "real-sun"];

/** Where the position comes from. Only a simulated position needs the clock mapping. */
export type PositionSource = "simulated" | "gps";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** Longitude to time: the Earth turns 15 degrees an hour, so one degree is four minutes. */
const MS_PER_DEGREE_OF_LONGITUDE = 4 * MINUTE_MS;

/** The offset of a device's time zone from UTC at an instant, in minutes east of UTC. */
export function utcOffsetMinutesAt(ms: number): number {
  // getTimezoneOffset is minutes west of UTC, and is 0 (not -0) for UTC.
  return -new Date(ms).getTimezoneOffset() || 0;
}

/**
 * The instant at which the apparent (sundial) local solar time at `lng` equals the device's wall
 * clock time of day on the device's date.
 *
 * How it works:
 *  1. Take the device's wall clock reading (date and time of day) as if it were UTC. This is
 *     `deviceNowMs` plus the device's UTC offset, and it is the same reading in any time zone.
 *  2. A place at longitude `lng` is ahead of UTC by `lng * 4` minutes in mean solar time, so
 *     subtract that to get the UTC instant at which mean solar time there reads the same.
 *  3. Mean and apparent solar time differ by the equation of time (up to about 16 minutes).
 *     Move by the difference between the real solar noon that day and 12:00 mean solar time, so
 *     a reading of 12:00 is exactly solar noon and 00:00 is exactly solar midnight.
 *
 * Edge cases:
 *  - Date line: the answer is an ordinary UTC instant. It can fall on the neighbouring UTC date
 *    (up to 12 hours either side), but the local solar date at the place is always the device's
 *    date, so no day is skipped or repeated.
 *  - Polar day and night: the sun is worked out honestly for that instant, so inside the polar
 *    circle in midwinter every clock time is dark and in midsummer every clock time is bright.
 *    The time of day cannot show in the sky there, exactly as it could not in real life.
 *  - Daylight saving: the device offset is read at the device's own instant, so the wall clock
 *    reading is what the person sees. On the two nights a year the clock jumps, the reading
 *    around the jump is a few minutes out, which no one can notice in the sky.
 *  - Time zone independence: the same wall clock reading in Melbourne, Berlin or New York maps to
 *    the same instant, because only the wall reading and the longitude are used.
 */
export function followClockInstant(
  deviceNowMs: number,
  deviceUtcOffsetMinutes: number,
  position: LatLng,
): number {
  const wallClockAsUtcMs = deviceNowMs + deviceUtcOffsetMinutes * MINUTE_MS;
  const meanSolarInstant = wallClockAsUtcMs - position.lng * MS_PER_DEGREE_OF_LONGITUDE;

  // Real solar noon for the solar day around that instant, against 12:00 mean solar time.
  const day = Math.floor(wallClockAsUtcMs / (24 * HOUR_MS)) * 24 * HOUR_MS;
  const meanNoon = day + 12 * HOUR_MS - position.lng * MS_PER_DEGREE_OF_LONGITUDE;
  const solarNoon = getSunTimes(position.lat, position.lng, new Date(meanNoon)).solarNoon;
  const equationOfTimeShift = solarNoon.getTime() - meanNoon;
  return meanSolarInstant + equationOfTimeShift;
}

export interface SunMomentInput {
  /** The mode the rider chose. Default `follow-clock`. */
  readonly mode: SunClockMode;
  /**
   * `simulated` for the demo route, `gps` once real GPS is in use. With a real position the
   * real time is the only consistent choice, so the mode is ignored and no mapping happens.
   */
  readonly positionSource: PositionSource;
  /** The device clock, as an instant. */
  readonly deviceNowMs: number;
  /** The device's UTC offset at that instant, minutes east of UTC (see `utcOffsetMinutesAt`). */
  readonly deviceUtcOffsetMinutes: number;
  /** Where the sun is worked out, which is where the rider is (or seems to be). */
  readonly position: LatLng;
}

/**
 * The instant to work the sun out for. This is the one place that decides it, so switching the
 * app to real GPS later is one line: pass `positionSource: "gps"`.
 */
export function sunMoment(input: SunMomentInput): number {
  if (input.positionSource === "gps" || input.mode === "real-sun") return input.deviceNowMs;
  return followClockInstant(input.deviceNowMs, input.deviceUtcOffsetMinutes, input.position);
}

/** Reads a mode from text, such as an address value. Anything unknown is undefined. */
export function parseSunClockMode(value: string | null | undefined): SunClockMode | undefined {
  const text = value?.trim().toLowerCase();
  if (text === "clock" || text === "follow-clock") return "follow-clock";
  if (text === "real" || text === "real-sun") return "real-sun";
  return undefined;
}
