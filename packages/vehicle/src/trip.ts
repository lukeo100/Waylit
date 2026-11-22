import type { SpeedSource } from "@waylit/core";
import { DEFAULT_TELEMETRY_STALE_MS, isTelemetryStale } from "./speed-selection";
import type { VehicleTelemetry } from "./types";

/** Why the vehicle trip distance was not used. Mirrors `SpeedFallbackReason`. */
export type TripFallbackReason =
  | "no-vehicle-telemetry"
  | "vehicle-distance-missing"
  | "vehicle-telemetry-stale"
  | "vehicle-distance-invalid";

export interface TripReading {
  /** Distance of the trip so far, in metres. */
  readonly distanceMetres: number;
  /** Duration of the trip so far, in seconds. */
  readonly durationSeconds: number;
  /** Where the latest distance came from. */
  readonly distanceSource: SpeedSource;
  /** Where the latest duration came from. */
  readonly durationSource: SpeedSource;
  /** Set when GPS distance was used because the vehicle's was not usable. */
  readonly distanceFallbackReason?: TripFallbackReason;
}

export interface TripUpdate {
  /** Latest vehicle telemetry, if any adapter is connected. */
  readonly vehicle?: VehicleTelemetry | undefined;
  /** Distance counted from GPS since the trip began, in metres. Never goes down. */
  readonly gpsDistanceMetres: number;
  /** Time since the trip began according to the ride clock, in seconds. */
  readonly rideElapsedSeconds: number;
  /** Current time in milliseconds since the Unix epoch. */
  readonly nowMs: number;
  /** Vehicle telemetry older than this is treated as stale. Default 2000. */
  readonly staleAfterMs?: number;
}

/**
 * Keeps one running trip distance and duration that carry on when vehicle telemetry drops out.
 *
 * Vehicle values are preferred, like vehicle speed in `selectSpeed`: they are what the rider's
 * own dashboard shows. While telemetry is missing, stale or invalid, the trip carries on with
 * GPS distance and the ride clock instead. The tracker adds up changes rather than switching
 * between two totals, so the figure never jumps when the source changes, and the distance
 * covered during a dropout is not lost. It never goes down.
 */
export class TripTracker {
  private distance = 0;
  private duration = 0;
  private lastGpsDistance: number | undefined;
  private lastRideElapsed: number | undefined;
  private lastVehicleDistance: number | undefined;
  private lastVehicleDuration: number | undefined;
  private latest: TripReading = {
    distanceMetres: 0,
    durationSeconds: 0,
    distanceSource: "gps",
    durationSource: "gps",
  };

  /** Adds what changed since the last call and returns the trip so far. */
  update(input: TripUpdate): TripReading {
    const staleAfter = input.staleAfterMs ?? DEFAULT_TELEMETRY_STALE_MS;
    const gpsDelta = Math.max(input.gpsDistanceMetres - (this.lastGpsDistance ?? 0), 0);
    const rideDelta = Math.max(input.rideElapsedSeconds - (this.lastRideElapsed ?? 0), 0);
    this.lastGpsDistance = Math.max(input.gpsDistanceMetres, this.lastGpsDistance ?? 0);
    this.lastRideElapsed = Math.max(input.rideElapsedSeconds, this.lastRideElapsed ?? 0);

    const vehicle = input.vehicle;
    const fresh = vehicle !== undefined && !isTelemetryStale(vehicle, input.nowMs, staleAfter);

    let reason: TripFallbackReason | undefined;
    let distanceSource: SpeedSource = "vehicle";
    const vehicleDistance = fresh ? vehicle.tripDistanceMetres : undefined;
    if (vehicle === undefined) reason = "no-vehicle-telemetry";
    else if (!fresh) reason = "vehicle-telemetry-stale";
    else if (vehicleDistance === undefined) reason = "vehicle-distance-missing";
    else if (!isCount(vehicleDistance)) reason = "vehicle-distance-invalid";

    if (reason === undefined && vehicleDistance !== undefined) {
      // A reading that went down means the vehicle started a new trip. Count from there.
      const delta =
        this.lastVehicleDistance !== undefined
          ? Math.max(vehicleDistance - this.lastVehicleDistance, 0)
          : 0;
      this.distance += delta;
      this.lastVehicleDistance = vehicleDistance;
    } else {
      distanceSource = "gps";
      this.distance += gpsDelta;
      // Forget the vehicle reading, so a gap is not counted twice when telemetry returns.
      this.lastVehicleDistance = undefined;
    }

    let durationSource: SpeedSource = "vehicle";
    const vehicleDuration = fresh ? vehicle.tripDurationSeconds : undefined;
    if (vehicleDuration !== undefined && isCount(vehicleDuration)) {
      const delta =
        this.lastVehicleDuration !== undefined
          ? Math.max(vehicleDuration - this.lastVehicleDuration, 0)
          : 0;
      this.duration += delta;
      this.lastVehicleDuration = vehicleDuration;
    } else {
      durationSource = "gps";
      this.duration += rideDelta;
      this.lastVehicleDuration = undefined;
    }

    this.latest = {
      distanceMetres: this.distance,
      durationSeconds: this.duration,
      distanceSource,
      durationSource,
      ...(reason !== undefined ? { distanceFallbackReason: reason } : {}),
    };
    return this.latest;
  }

  /** The most recent reading. */
  get reading(): TripReading {
    return this.latest;
  }

  /** Starts a new trip. */
  reset(): void {
    this.distance = 0;
    this.duration = 0;
    this.lastGpsDistance = undefined;
    this.lastRideElapsed = undefined;
    this.lastVehicleDistance = undefined;
    this.lastVehicleDuration = undefined;
    this.latest = {
      distanceMetres: 0,
      durationSeconds: 0,
      distanceSource: "gps",
      durationSource: "gps",
    };
  }
}

function isCount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
