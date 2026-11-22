/**
 * Speed guard. Above a threshold speed the HUD treats secondary controls as locked: media
 * controls and End trip stay available but need a deliberate press (a short hold), so a bump
 * or a stray touch while riding does nothing. The guard switches on at one speed and off at a
 * lower one, so it does not flicker around the threshold.
 */

/** The guard switches on at or above this speed, in km/h. */
export const GUARD_ON_KMH = 8;
/** The guard switches off again below this speed, in km/h. */
export const GUARD_OFF_KMH = 5;

/** How long a guarded control must be held to count as a press, in milliseconds. */
export const HOLD_TO_PRESS_MS = 600;
/** End trip is held a little longer, since it cannot be undone. */
export const HOLD_TO_END_MS = 900;

/** Returns whether the guard is on, given whether it was on and the current speed. */
export function nextGuardState(wasGuarded: boolean, speedKmh: number | undefined): boolean {
  if (speedKmh === undefined || !Number.isFinite(speedKmh)) return wasGuarded;
  if (wasGuarded) return speedKmh >= GUARD_OFF_KMH;
  return speedKmh >= GUARD_ON_KMH;
}
