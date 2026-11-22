/**
 * Number formatting for the HUD, shared by every platform. Values are split into a number and
 * a unit so a screen can set the unit smaller than the number. Missing values come out as
 * "--". Only metric units are produced for now.
 */

export interface FormattedValue {
  readonly value: string;
  readonly unit: string;
}

export const MISSING_VALUE = "--";

/** Speed in whole kilometres per hour. Input is metres per second. */
export function formatSpeedKmh(mps: number | undefined): FormattedValue {
  if (mps === undefined || !Number.isFinite(mps)) return { value: MISSING_VALUE, unit: "km/h" };
  const kmh = Math.max(mps, 0) * 3.6;
  return { value: String(Math.round(kmh)), unit: "km/h" };
}

/**
 * Distance for a countdown or a remaining figure. Short distances are rounded so the digits do
 * not flicker: to 5 m under 20 m, to 10 m under 1 km. Longer ones use one decimal place in
 * kilometres up to 10 km, then whole kilometres.
 */
export function formatDistance(metres: number | undefined): FormattedValue {
  if (metres === undefined || !Number.isFinite(metres)) return { value: MISSING_VALUE, unit: "m" };
  const m = Math.max(metres, 0);
  if (m < 20) return { value: String(Math.round(m / 5) * 5), unit: "m" };
  if (m < 995) return { value: String(Math.round(m / 10) * 10), unit: "m" };
  const km = m / 1000;
  return { value: km < 9.95 ? km.toFixed(1) : String(Math.round(km)), unit: "km" };
}

/** Distance for a trip counter: kilometres with two decimals up to 10 km, then one. */
export function formatTripDistance(metres: number | undefined): FormattedValue {
  if (metres === undefined || !Number.isFinite(metres)) return { value: MISSING_VALUE, unit: "km" };
  const km = Math.max(metres, 0) / 1000;
  return { value: km < 10 ? km.toFixed(2) : km.toFixed(1), unit: "km" };
}

/** A length of time such as "45 s", "12 min" or "1 h 05 min". Under a minute shows seconds. */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return MISSING_VALUE;
  const total = Math.max(Math.round(seconds), 0);
  if (total < 60) return `${total} s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** A running trip time such as "04:09" or "1:02:09". */
export function formatStopwatch(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return MISSING_VALUE;
  const total = Math.max(Math.floor(seconds), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** A battery or similar percentage, as a whole number. */
export function formatPercent(percent: number | undefined): FormattedValue {
  if (percent === undefined || !Number.isFinite(percent)) {
    return { value: MISSING_VALUE, unit: "%" };
  }
  return { value: String(Math.round(Math.min(Math.max(percent, 0), 100))), unit: "%" };
}

/** Range in whole kilometres. Input is metres. */
export function formatRange(metres: number | undefined): FormattedValue {
  if (metres === undefined || !Number.isFinite(metres)) return { value: MISSING_VALUE, unit: "km" };
  return { value: String(Math.round(Math.max(metres, 0) / 1000)), unit: "km" };
}

/** Average speed over a distance and a time, in kilometres per hour. Zero if no time passed. */
export function averageSpeedKmh(distanceMetres: number, durationSeconds: number): number {
  if (!(durationSeconds > 0) || !Number.isFinite(distanceMetres)) return 0;
  return (Math.max(distanceMetres, 0) / durationSeconds) * 3.6;
}
