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
  /** True if any of the distance so far was counted from GPS, at any point in the trip. */
  readonly usedGps: boolean;
  /** How much of `distanceMetres` was counted from GPS, in metres. */
  readonly gpsDistanceMetres: number;
}

const EMPTY_READING: TripReading = {
  distanceMetres: 0,
  durationSeconds: 0,
  distanceSource: "gps",
  durationSource: "gps",
  usedGps: false,
  gpsDistanceMetres: 0,
};

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
 * between two totals, so the figure never jumps when the source changes, and it never goes down.
 *
 * A frozen sample counts as fresh for a couple of seconds, and during that window the vehicle
 * adds nothing. So the tracker remembers the GPS distance and ride time at the last moment the
 * vehicle actually reported something new (the anchor). When telemetry goes stale, everything
 * GPS saw since the anchor is added at once (the backfill), so the stale window is not lost.
 * The same happens on the first sample after a dropout, so the gap is covered from both ends.
 */
export class TripTracker {
  private distance = 0;
  private duration = 0;
  private gpsCounted = 0;
  private usedGps = false;
  private lastGpsDistance: number | undefined;
  private lastRideElapsed: number | undefined;
  private lastVehicleDistance: number | undefined;
  private lastVehicleDuration: number | undefined;
  private lastVehicleTimestamp: number | undefined;
  /** GPS distance and ride time when the vehicle last reported something new. */
  private anchorGps = 0;
  private anchorRide = 0;
  private latest: TripReading = EMPTY_READING;

  /** Adds what changed since the last call and returns the trip so far. */
  update(input: TripUpdate): TripReading {
    const staleAfter = input.staleAfterMs ?? DEFAULT_TELEMETRY_STALE_MS;
    const gpsNow = Math.max(input.gpsDistanceMetres, this.lastGpsDistance ?? 0);
    const rideNow = Math.max(input.rideElapsedSeconds, this.lastRideElapsed ?? 0);
    this.lastGpsDistance = gpsNow;
    this.lastRideElapsed = rideNow;

    const vehicle = input.vehicle;
    const fresh = vehicle !== undefined && !isTelemetryStale(vehicle, input.nowMs, staleAfter);
    // A sample with the same timestamp as the last one is the link repeating itself.
    const advanced = fresh && vehicle.timestamp !== this.lastVehicleTimestamp;
    this.lastVehicleTimestamp = fresh ? vehicle.timestamp : undefined;

    let reason: TripFallbackReason | undefined;
    const vehicleDistance = fresh ? vehicle.tripDistanceMetres : undefined;
    if (vehicle === undefined) reason = "no-vehicle-telemetry";
    else if (!fresh) reason = "vehicle-telemetry-stale";
    else if (vehicleDistance === undefined) reason = "vehicle-distance-missing";
    else if (!isCount(vehicleDistance)) reason = "vehicle-distance-invalid";

    // What GPS and the ride clock saw since the vehicle last reported something new.
    const gpsSinceAnchor = Math.max(gpsNow - this.anchorGps, 0);
    const rideSinceAnchor = Math.max(rideNow - this.anchorRide, 0);

    let distanceSource: SpeedSource = "vehicle";
    if (reason === undefined && vehicleDistance !== undefined) {
      if (advanced) {
        if (this.lastVehicleDistance !== undefined) {
          // A reading that went down means the vehicle started a new trip. Count from there.
          this.distance += Math.max(vehicleDistance - this.lastVehicleDistance, 0);
        } else {
          // The first sample of the trip, or the first after a dropout. Nothing is known about
          // the gap before it, so GPS covers it.
          this.addGps(gpsSinceAnchor);
        }
        this.lastVehicleDistance = vehicleDistance;
        this.anchorGps = gpsNow;
      }
    } else {
      distanceSource = "gps";
      this.addGps(gpsSinceAnchor);
      this.anchorGps = gpsNow;
      // Forget the vehicle reading, so a gap is not counted twice when telemetry returns.
      this.lastVehicleDistance = undefined;
    }

    let durationSource: SpeedSource = "vehicle";
    const vehicleDuration = fresh ? vehicle.tripDurationSeconds : undefined;
    if (vehicleDuration !== undefined && isCount(vehicleDuration)) {
      if (advanced) {
        this.duration +=
          this.lastVehicleDuration !== undefined
            ? Math.max(vehicleDuration - this.lastVehicleDuration, 0)
            : rideSinceAnchor;
        this.lastVehicleDuration = vehicleDuration;
        this.anchorRide = rideNow;
      }
    } else {
      durationSource = "gps";
      this.duration += rideSinceAnchor;
      this.anchorRide = rideNow;
      this.lastVehicleDuration = undefined;
    }

    this.latest = {
      distanceMetres: this.distance,
      durationSeconds: this.duration,
      distanceSource,
      durationSource,
      usedGps: this.usedGps,
      gpsDistanceMetres: this.gpsCounted,
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
    this.gpsCounted = 0;
    this.usedGps = false;
    this.lastGpsDistance = undefined;
    this.lastRideElapsed = undefined;
    this.lastVehicleDistance = undefined;
    this.lastVehicleDuration = undefined;
    this.lastVehicleTimestamp = undefined;
    this.anchorGps = 0;
    this.anchorRide = 0;
    this.latest = EMPTY_READING;
  }

  /** Adds GPS distance to the trip and notes that GPS was used. Returns what it added. */
  private addGps(metres: number): number {
    this.distance += metres;
    this.gpsCounted += metres;
    if (metres > 0) this.usedGps = true;
    return metres;
  }
}

function isCount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
