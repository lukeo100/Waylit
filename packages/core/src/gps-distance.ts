import { haversineDistance } from "./geo";
import type { GeoPosition, PositionFix } from "./types";

/**
 * Adds up distance travelled from a stream of GPS fixes. It is the fallback for trip distance
 * when the vehicle does not report one.
 *
 * GPS positions wobble by a few metres even when standing still, and adding up every wobble
 * would make the trip grow while parked. Two guards stop that. A fix that reports a speed
 * below walking pace is treated as standing still and counts nothing. Otherwise distance is
 * only counted once a fix is a few metres from the last counted point, and that point then
 * becomes the new anchor. Nothing is lost on a slow ride, the distance is just counted in
 * steps.
 */

export interface GpsDistanceOptions {
  /** Smallest move that is counted, in metres. Default 3. */
  readonly minStepMetres?: number;
  /** Fixes with a worse accuracy radius than this are ignored, in metres. Default 50. */
  readonly maxAccuracyMetres?: number;
  /** A fix reporting less than this speed counts as standing still, in m/s. Default 0.5. */
  readonly minSpeedMps?: number;
}

export class GpsDistanceIntegrator {
  private readonly minStep: number;
  private readonly maxAccuracy: number;
  private readonly minSpeed: number;
  private anchor: GeoPosition | undefined;
  private total = 0;

  constructor(options: GpsDistanceOptions = {}) {
    this.minStep = options.minStepMetres ?? 3;
    this.maxAccuracy = options.maxAccuracyMetres ?? 50;
    this.minSpeed = options.minSpeedMps ?? 0.5;
  }

  /** Distance counted so far, in metres. */
  get distanceMetres(): number {
    return this.total;
  }

  /** Adds a fix and returns the distance counted so far, in metres. */
  add(fix: PositionFix): number {
    const { position } = fix;
    if (position.accuracy !== undefined && position.accuracy > this.maxAccuracy) return this.total;
    if (this.anchor === undefined || (fix.speedMps !== undefined && fix.speedMps < this.minSpeed)) {
      this.anchor = position;
      return this.total;
    }
    const step = haversineDistance(this.anchor, position);
    if (step >= this.minStep) {
      this.total += step;
      this.anchor = position;
    }
    return this.total;
  }

  /** Starts counting again from zero. */
  reset(): void {
    this.anchor = undefined;
    this.total = 0;
  }
}
