import type { PositionFix, SpeedSource } from "@waylit/core";
import type { VehicleTelemetry } from "./types";

/** Why the vehicle speed was not used. */
export type SpeedFallbackReason =
  | "no-vehicle-telemetry"
  | "vehicle-speed-missing"
  | "vehicle-telemetry-stale"
  | "vehicle-speed-invalid";

export interface SelectedSpeed {
  /** The speed to show, in metres per second. Undefined when no source has a usable value. */
  readonly speedMps: number | undefined;
  /** Where `speedMps` came from. Undefined when nothing was usable. */
  readonly source: SpeedSource | undefined;
  /** Set when GPS was used, or nothing was available, because the vehicle speed was not usable. */
  readonly fallbackReason?: SpeedFallbackReason;
}

export interface SelectSpeedInput {
  /** Latest vehicle telemetry, if any adapter is connected. */
  readonly vehicle?: VehicleTelemetry | undefined;
  /** Latest GPS fix, if any. */
  readonly gps?: PositionFix | undefined;
  /** Current time in milliseconds since the Unix epoch. */
  readonly nowMs: number;
  /** Vehicle telemetry older than this is treated as stale. Default 2000. */
  readonly staleAfterMs?: number;
  /** GPS fixes older than this are ignored. Default 5000. */
  readonly gpsStaleAfterMs?: number;
}

export const DEFAULT_TELEMETRY_STALE_MS = 2000;
export const DEFAULT_GPS_STALE_MS = 5000;

/**
 * Chooses the speed to display. Vehicle speed wins when it is present and fresh, because it
 * is what the rider's own dashboard shows. If it is missing, stale or not a sensible number,
 * GPS speed is used instead. The two values stay separate in the app, and this only picks one
 * for the headline figure and says which source it used.
 */
export function selectSpeed(input: SelectSpeedInput): SelectedSpeed {
  const staleAfter = input.staleAfterMs ?? DEFAULT_TELEMETRY_STALE_MS;
  const gpsStaleAfter = input.gpsStaleAfterMs ?? DEFAULT_GPS_STALE_MS;

  let reason: SpeedFallbackReason | undefined;
  const vehicle = input.vehicle;
  if (vehicle === undefined) {
    reason = "no-vehicle-telemetry";
  } else if (vehicle.speedMps === undefined) {
    reason = "vehicle-speed-missing";
  } else if (!Number.isFinite(vehicle.speedMps) || vehicle.speedMps < 0) {
    reason = "vehicle-speed-invalid";
  } else if (isStale(vehicle.timestamp, input.nowMs, staleAfter)) {
    reason = "vehicle-telemetry-stale";
  } else {
    return { speedMps: vehicle.speedMps, source: "vehicle" };
  }

  const gps = input.gps;
  const gpsSpeed = gps?.speedMps;
  if (
    gps !== undefined &&
    gpsSpeed !== undefined &&
    Number.isFinite(gpsSpeed) &&
    gpsSpeed >= 0 &&
    !isStale(gps.timestamp, input.nowMs, gpsStaleAfter)
  ) {
    return { speedMps: gpsSpeed, source: "gps", fallbackReason: reason };
  }
  return { speedMps: undefined, source: undefined, fallbackReason: reason };
}

/** A timestamp in the future by a little is fine, a clock may be slightly off. */
function isStale(timestamp: number, nowMs: number, maxAgeMs: number): boolean {
  return !Number.isFinite(timestamp) || nowMs - timestamp > maxAgeMs;
}
