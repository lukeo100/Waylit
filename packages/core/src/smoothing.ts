import {
  fromLocalMetres,
  normaliseDegrees,
  shortestAngleDelta,
  toLocalMetres,
  type LocalMetres,
} from "./geo";
import type { LatLng } from "./types";

/**
 * Small filters for tidying noisy GPS values. They are pure and keep no reference to time
 * beyond the `dtSeconds` the caller passes in, so tests can drive them directly.
 */

/**
 * Exponential low-pass filter for a scalar such as speed. The time constant is the time it
 * takes to close about 63 percent of a step change. Using the real time step keeps the
 * behaviour the same whatever the sample rate.
 */
export class LowPassFilter {
  private current: number | undefined;

  constructor(private readonly timeConstantSeconds: number) {}

  get value(): number | undefined {
    return this.current;
  }

  update(sample: number, dtSeconds: number): number {
    if (this.current === undefined || this.timeConstantSeconds <= 0) {
      this.current = sample;
      return sample;
    }
    if (dtSeconds <= 0) return this.current;
    const alpha = 1 - Math.exp(-dtSeconds / this.timeConstantSeconds);
    this.current += alpha * (sample - this.current);
    return this.current;
  }

  reset(): void {
    this.current = undefined;
  }
}

/** Low-pass filter for headings in degrees. It turns the short way round through north. */
export class AngleLowPassFilter {
  private current: number | undefined;

  constructor(private readonly timeConstantSeconds: number) {}

  get value(): number | undefined {
    return this.current;
  }

  update(headingDegrees: number, dtSeconds: number): number {
    if (this.current === undefined || this.timeConstantSeconds <= 0) {
      this.current = normaliseDegrees(headingDegrees);
      return this.current;
    }
    if (dtSeconds <= 0) return this.current;
    const alpha = 1 - Math.exp(-dtSeconds / this.timeConstantSeconds);
    this.current = normaliseDegrees(
      this.current + alpha * shortestAngleDelta(this.current, headingDegrees),
    );
    return this.current;
  }

  reset(): void {
    this.current = undefined;
  }
}

/**
 * Alpha-beta filter for one axis. It is a Kalman filter with fixed gains: it predicts with
 * the estimated velocity, then corrects both position and velocity from each measurement.
 * Unlike a plain low-pass filter it does not lag behind a steadily moving target.
 */
export class AlphaBetaFilter {
  private position: number | undefined;
  private velocity = 0;

  /** `alpha` corrects position and `beta` corrects velocity. Both are between 0 and 1. */
  constructor(
    private readonly alpha: number,
    private readonly beta: number,
  ) {}

  get estimate(): number | undefined {
    return this.position;
  }

  get velocityEstimate(): number {
    return this.velocity;
  }

  update(measurement: number, dtSeconds: number): number {
    if (this.position === undefined) {
      this.position = measurement;
      this.velocity = 0;
      return measurement;
    }
    if (dtSeconds <= 0) return this.position;
    const predicted = this.position + this.velocity * dtSeconds;
    const residual = measurement - predicted;
    this.position = predicted + this.alpha * residual;
    this.velocity += (this.beta * residual) / dtSeconds;
    return this.position;
  }

  reset(): void {
    this.position = undefined;
    this.velocity = 0;
  }
}

export interface PositionSmootherOptions {
  /** Position gain from 0 to 1. Higher trusts new fixes more. Default 0.5. */
  readonly alpha?: number;
  /** Velocity gain from 0 to 1. Default 0.15. */
  readonly beta?: number;
}

/** Smooths a stream of latitude and longitude fixes in a local flat plane. */
export class PositionSmoother {
  private origin: LatLng | undefined;
  private readonly east: AlphaBetaFilter;
  private readonly north: AlphaBetaFilter;

  constructor(options: PositionSmootherOptions = {}) {
    const alpha = options.alpha ?? 0.5;
    const beta = options.beta ?? 0.15;
    this.east = new AlphaBetaFilter(alpha, beta);
    this.north = new AlphaBetaFilter(alpha, beta);
  }

  update(fix: LatLng, dtSeconds: number): LatLng {
    this.origin ??= fix;
    const local: LocalMetres = toLocalMetres(this.origin, fix);
    return fromLocalMetres(this.origin, {
      east: this.east.update(local.east, dtSeconds),
      north: this.north.update(local.north, dtSeconds),
    });
  }

  reset(): void {
    this.origin = undefined;
    this.east.reset();
    this.north.reset();
  }
}
