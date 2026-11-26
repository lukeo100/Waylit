import type { GroundHeightSource } from "./ground-height";

/**
 * The ground height for live GPS rides, from the phone's own altitude. It never touches the
 * map tiles (Amendment 3): the number comes from the receiver and a constant.
 *
 * The Geolocation specification says `coords.altitude` is the height above the WGS84 ellipsoid,
 * which is what Cesium places things by. Phones are not always that tidy: some give sea level
 * height, and the accuracy is often 10 m or worse. So the estimate is careful:
 *
 *  - only samples with a known altitude accuracy of `maxAltitudeAccuracyMetres` or better count
 *  - the phone sits about `deviceHeightMetres` above the ground, so that is taken off
 *  - the estimate is a slow average (time constant 20 s) that can change at most
 *    `maxSlewMetresPerSecond`, so a bad reading cannot make the camera jump
 *  - a sample far from the estimate is ignored, and the result is clamped to a sane range
 *  - until `minSamples` good samples have arrived it returns the fallback constant
 *
 * The fallback is the maintainer's constant from the settings, or the route's own documented one.
 * It is flagged as uncertain in docs/ARCHITECTURE.md: not verified on a device.
 */

export interface LiveGroundOptions {
  /** Used until the phone has given enough good altitude samples. Metres above the ellipsoid. */
  readonly fallbackMetres: number;
  /** How far above the ground the phone sits on the scooter, in metres. Default 1.2. */
  readonly deviceHeightMetres?: number;
  /** Altitude accuracy worse than this (or unknown) is ignored, in metres. Default 20. */
  readonly maxAltitudeAccuracyMetres?: number;
  readonly minSamples?: number;
  readonly timeConstantSeconds?: number;
  readonly maxSlewMetresPerSecond?: number;
  /** A sample this far from the estimate is ignored, in metres. Default 40. */
  readonly outlierMetres?: number;
  readonly minMetres?: number;
  readonly maxMetres?: number;
}

export type GroundSourceKind = "phone" | "fallback";

export class LiveGroundEstimator implements GroundHeightSource {
  private fallback: number;
  private readonly deviceHeight: number;
  private readonly maxAccuracy: number;
  private readonly minSamples: number;
  private readonly timeConstant: number;
  private readonly maxSlew: number;
  private readonly outlier: number;
  private readonly min: number;
  private readonly max: number;

  private estimate: number | undefined;
  private samples = 0;
  private lastMs: number | undefined;

  constructor(options: LiveGroundOptions) {
    this.fallback = options.fallbackMetres;
    this.deviceHeight = options.deviceHeightMetres ?? 1.2;
    this.maxAccuracy = options.maxAltitudeAccuracyMetres ?? 20;
    this.minSamples = options.minSamples ?? 3;
    this.timeConstant = options.timeConstantSeconds ?? 20;
    this.maxSlew = options.maxSlewMetresPerSecond ?? 1;
    this.outlier = options.outlierMetres ?? 40;
    this.min = options.minMetres ?? -100;
    this.max = options.maxMetres ?? 3000;
  }

  get source(): GroundSourceKind {
    return this.samples >= this.minSamples && this.estimate !== undefined ? "phone" : "fallback";
  }

  /** The constant that is used before the phone has given a reliable altitude. */
  setFallback(metres: number): void {
    this.fallback = metres;
  }

  /** Adds a phone altitude sample. Samples that are not good enough are ignored. */
  addSample(
    altitudeMetres: number | undefined,
    altitudeAccuracyMetres: number | undefined,
    nowMs: number,
  ): void {
    if (altitudeMetres === undefined || !Number.isFinite(altitudeMetres)) return;
    if (
      altitudeAccuracyMetres === undefined ||
      !Number.isFinite(altitudeAccuracyMetres) ||
      altitudeAccuracyMetres > this.maxAccuracy
    ) {
      return;
    }
    const ground = altitudeMetres - this.deviceHeight;
    if (this.estimate === undefined) {
      this.estimate = clamp(ground, this.min, this.max);
      this.samples = 1;
      this.lastMs = nowMs;
      return;
    }
    if (Math.abs(ground - this.estimate) > this.outlier) return;
    const dt = Math.max((nowMs - (this.lastMs ?? nowMs)) / 1000, 0);
    this.lastMs = nowMs;
    this.samples += 1;
    const alpha = 1 - Math.exp(-dt / this.timeConstant);
    const wanted = this.estimate + alpha * (ground - this.estimate);
    const limit = this.maxSlew * dt;
    const step = clamp(wanted - this.estimate, -limit, limit);
    this.estimate = clamp(this.estimate + step, this.min, this.max);
  }

  /** Forget the phone's samples, for a new ride. */
  reset(): void {
    this.estimate = undefined;
    this.samples = 0;
    this.lastMs = undefined;
  }

  heightAt(): number {
    return this.source === "phone" && this.estimate !== undefined ? this.estimate : this.fallback;
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
