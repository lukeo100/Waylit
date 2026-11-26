import type { PositionFix } from "./types";

/**
 * Where the rider's position comes from. The simulator (`GpsSimulator`) and the phone GPS
 * (`LiveGpsSource`) both fit this shape, so the rest of the app does not care which one runs.
 * A source is polled with `update()` a few times a second and also pushes fixes to listeners.
 */
export interface FixSource {
  /** Begins producing fixes. For a real receiver this must run inside a user gesture. */
  start(): void;
  /** Stops producing fixes and releases the receiver. */
  stop(): void;
  /** Catches up to the clock and returns the latest smoothed fix, if there is one. */
  update(): PositionFix | undefined;
  getLastFix(): PositionFix | undefined;
  /** Subscribes to smoothed fixes. Returns a function that unsubscribes. */
  onFix(listener: (fix: PositionFix) => void): () => void;
}

/**
 * The state of a live receiver, in words the screen can use.
 *
 *   idle         not started
 *   requesting   asked the browser, no fix yet (the permission prompt may be open)
 *   active       fixes arriving with good accuracy
 *   weak         fixes arriving but with poor accuracy, or none good enough yet
 *   denied       the rider or the browser refused location access
 *   unavailable  this device or browser cannot give a location
 *   stale        fixes were arriving and then stopped
 */
export type GpsStatus =
  "idle" | "requesting" | "active" | "weak" | "denied" | "unavailable" | "stale";
