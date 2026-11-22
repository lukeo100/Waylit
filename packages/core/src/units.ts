/** Unit conversions shared by every platform. Internal values are SI (metres, seconds). */

export const METRES_PER_KILOMETRE = 1000;
export const METRES_PER_MILE = 1609.344;
export const SECONDS_PER_HOUR = 3600;

/** Metres per second to kilometres per hour. */
export function mpsToKmh(mps: number): number {
  return (mps * SECONDS_PER_HOUR) / METRES_PER_KILOMETRE;
}

/** Kilometres per hour to metres per second. */
export function kmhToMps(kmh: number): number {
  return (kmh * METRES_PER_KILOMETRE) / SECONDS_PER_HOUR;
}

/** Metres per second to miles per hour. */
export function mpsToMph(mps: number): number {
  return (mps * SECONDS_PER_HOUR) / METRES_PER_MILE;
}

/** Miles per hour to metres per second. */
export function mphToMps(mph: number): number {
  return (mph * METRES_PER_MILE) / SECONDS_PER_HOUR;
}

/** Metres to kilometres. */
export function metresToKilometres(metres: number): number {
  return metres / METRES_PER_KILOMETRE;
}

/** Metres to miles. */
export function metresToMiles(metres: number): number {
  return metres / METRES_PER_MILE;
}
