import { systemClock, type Clock } from "./clock";
import { bearingDegrees, shortestAngleDelta } from "./geo";
import { createRng, gaussian, type RandomSource } from "./random";
import { createRouteIndex, locateAlongRoute, type RouteIndex } from "./route";
import { AngleLowPassFilter, LowPassFilter, PositionSmoother } from "./smoothing";
import type { LatLng, PositionFix } from "./types";
import { kmhToMps } from "./units";

/**
 * Simulated GPS. A virtual rider follows a route with a simple speed model (accelerate to a
 * cruise speed, slow for corners, stop at the end). Each second a pretend receiver reports a
 * noisy fix, and the smoothing filters turn that into the fixes the app uses.
 *
 * Nothing here knows about the DOM or a timer. The caller calls `update()` often, for example
 * once per animation frame or once per second, and the simulator catches up to the clock.
 * With an injected clock and a fixed seed the output is fully repeatable.
 */

export type SimulatorState = "idle" | "playing" | "paused" | "finished";

export interface GpsNoiseOptions {
  /** Standard deviation of position error per axis, in metres. Default 2. */
  readonly positionStdMetres?: number;
  /** Standard deviation of speed error in metres per second. Default 0.15. */
  readonly speedStdMps?: number;
  /** Standard deviation of heading error in degrees. Default 2. */
  readonly headingStdDegrees?: number;
}

export interface GpsSmoothingOptions {
  /** Position gain, 0 to 1. Default 0.5. */
  readonly positionAlpha?: number;
  /** Velocity gain for the position filter, 0 to 1. Default 0.15. */
  readonly positionBeta?: number;
  /** Time constant of the speed low-pass filter in seconds. Default 1.5. */
  readonly speedTimeConstantSeconds?: number;
  /** Time constant of the heading low-pass filter in seconds. Default 1. */
  readonly headingTimeConstantSeconds?: number;
}

export interface GpsSimulatorOptions {
  /** The path to follow. Needs at least two points. */
  readonly path: readonly LatLng[];
  /** Time source. Defaults to the system clock. */
  readonly clock?: Clock;
  /** Playback speed multiplier, above 0. 2 means the ride runs twice as fast. Default 1. */
  readonly playbackSpeed?: number;
  /** Target speed on straight sections in km/h. Default 20, under the 25 km/h legal limit. */
  readonly cruiseSpeedKmh?: number;
  /** Acceleration in m/s squared. Default 1. */
  readonly accelerationMps2?: number;
  /** Braking in m/s squared. Default 1.5. */
  readonly brakingMps2?: number;
  /** Sideways acceleration limit used to slow for corners, in m/s squared. Default 0.8. */
  readonly lateralAccelerationMps2?: number;
  /** Start again from the beginning when the end is reached. Default false. */
  readonly loop?: boolean;
  /** Time between receiver fixes in milliseconds of clock time. Default 1000. */
  readonly fixIntervalMs?: number;
  /** Receiver noise. Pass zeros for a perfect receiver. */
  readonly noise?: GpsNoiseOptions;
  readonly smoothing?: GpsSmoothingOptions;
  /** Seed for the noise generator. Default 1. */
  readonly seed?: number;
}

/** The true state of the virtual rider, before any receiver noise. */
export interface RideTruth {
  readonly distanceMetres: number;
  readonly remainingMetres: number;
  readonly speedMps: number;
  /** Simulated seconds spent playing. Pauses are excluded and playback speed is applied. */
  readonly elapsedSeconds: number;
  readonly state: SimulatorState;
}

export type FixListener = (fix: PositionFix) => void;

/** Largest slice of simulated time integrated in one step, for stable physics. */
const MAX_STEP_SECONDS = 0.1;
/**
 * A turn is treated as happening over at most this many metres, so a sharp corner drawn as a
 * single vertex still makes the rider slow down.
 */
const MAX_TURN_SPAN_METRES = 15;
/** If the caller was away longer than this, the extra clock time is skipped. */
const MAX_CATCH_UP_MS = 10_000;
/** The ride is finished when this close to the end of a route that does not loop. */
const FINISH_TOLERANCE_METRES = 0.5;

export class GpsSimulator {
  private readonly clock: Clock;
  private readonly index: RouteIndex;
  private readonly random: RandomSource;
  private readonly cruiseMps: number;
  private readonly accel: number;
  private readonly braking: number;
  private readonly loop: boolean;
  private readonly fixIntervalMs: number;
  private readonly noise: Required<GpsNoiseOptions>;
  private readonly allowedSpeedAtVertex: readonly number[];

  private readonly positionSmoother: PositionSmoother;
  private readonly speedFilter: LowPassFilter;
  private readonly headingFilter: AngleLowPassFilter;
  private readonly listeners = new Set<FixListener>();

  private stateValue: SimulatorState = "idle";
  private playbackSpeed: number;
  private lastClockMs = 0;
  private pendingMs = 0;
  private distance = 0;
  private speed = 0;
  private elapsed = 0;
  private lastRaw: PositionFix | undefined;
  private lastFix: PositionFix | undefined;

  constructor(options: GpsSimulatorOptions) {
    this.clock = options.clock ?? systemClock;
    this.index = createRouteIndex(options.path);
    this.random = createRng(options.seed ?? 1);
    this.cruiseMps = kmhToMps(options.cruiseSpeedKmh ?? 20);
    this.accel = options.accelerationMps2 ?? 1;
    this.braking = options.brakingMps2 ?? 1.5;
    this.loop = options.loop ?? false;
    this.fixIntervalMs = options.fixIntervalMs ?? 1000;
    this.noise = {
      positionStdMetres: options.noise?.positionStdMetres ?? 2,
      speedStdMps: options.noise?.speedStdMps ?? 0.15,
      headingStdDegrees: options.noise?.headingStdDegrees ?? 2,
    };
    const smoothing = options.smoothing ?? {};
    this.positionSmoother = new PositionSmoother({
      ...(smoothing.positionAlpha !== undefined ? { alpha: smoothing.positionAlpha } : {}),
      ...(smoothing.positionBeta !== undefined ? { beta: smoothing.positionBeta } : {}),
    });
    this.speedFilter = new LowPassFilter(smoothing.speedTimeConstantSeconds ?? 1.5);
    this.headingFilter = new AngleLowPassFilter(smoothing.headingTimeConstantSeconds ?? 1);
    this.playbackSpeed = assertPlaybackSpeed(options.playbackSpeed ?? 1);
    this.allowedSpeedAtVertex = this.buildSpeedProfile(options.lateralAccelerationMps2 ?? 0.8);
  }

  get state(): SimulatorState {
    return this.stateValue;
  }

  get speedMultiplier(): number {
    return this.playbackSpeed;
  }

  /** Starts a ride from the beginning, or restarts one that has finished. */
  start(): void {
    this.resetRide();
    this.stateValue = "playing";
    this.lastClockMs = this.clock.now();
    this.emitFix(this.clock.now());
  }

  /** Pauses the ride. Time that passes while paused does not count. */
  pause(): void {
    if (this.stateValue !== "playing") return;
    this.update();
    this.stateValue = "paused";
  }

  /** Continues a paused ride. */
  resume(): void {
    if (this.stateValue !== "paused") return;
    this.lastClockMs = this.clock.now();
    this.stateValue = "playing";
  }

  /** Stops the ride and returns to the idle state. */
  stop(): void {
    this.resetRide();
    this.stateValue = "idle";
  }

  /** Changes playback speed. It takes effect from now, and earlier progress is kept. */
  setPlaybackSpeed(multiplier: number): void {
    this.update();
    this.playbackSpeed = assertPlaybackSpeed(multiplier);
  }

  /**
   * Catches up to the clock and returns the latest smoothed fix, or undefined before the
   * first fix. Listeners are called once for every new fix produced.
   */
  update(): PositionFix | undefined {
    if (this.stateValue !== "playing") return this.lastFix;
    const nowMs = this.clock.now();
    const elapsedMs = Math.min(Math.max(nowMs - this.lastClockMs, 0), MAX_CATCH_UP_MS);
    this.lastClockMs = nowMs;
    this.pendingMs += elapsedMs;
    let fixTime = nowMs - this.pendingMs;
    while (this.pendingMs >= this.fixIntervalMs && this.stateValue === "playing") {
      this.pendingMs -= this.fixIntervalMs;
      fixTime += this.fixIntervalMs;
      this.advance((this.fixIntervalMs / 1000) * this.playbackSpeed);
      this.emitFix(fixTime);
    }
    return this.lastFix;
  }

  /** The most recent smoothed fix. Does not advance the simulation. */
  getLastFix(): PositionFix | undefined {
    return this.lastFix;
  }

  /** The most recent raw, noisy receiver fix. Useful for showing what smoothing removed. */
  getLastRawFix(): PositionFix | undefined {
    return this.lastRaw;
  }

  /** True state of the rider as of the last `update()`. The mock vehicle reads speed from here. */
  getTruth(): RideTruth {
    return {
      distanceMetres: this.distance,
      remainingMetres: Math.max(this.index.totalMetres - this.distance, 0),
      speedMps: this.speed,
      elapsedSeconds: this.elapsed,
      state: this.stateValue,
    };
  }

  /**
   * True speed and simulated elapsed time as of the last `update()`. The shape matches the
   * motion source the mock vehicle adapter reads, so the two can be wired together directly.
   */
  getMotion(): { readonly speedMps: number; readonly elapsedSeconds: number } {
    return { speedMps: this.speed, elapsedSeconds: this.elapsed };
  }

  /** Subscribes to smoothed fixes. Returns a function that unsubscribes. */
  onFix(listener: FixListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private resetRide(): void {
    this.distance = 0;
    this.speed = 0;
    this.elapsed = 0;
    this.pendingMs = 0;
    this.lastRaw = undefined;
    this.lastFix = undefined;
    this.positionSmoother.reset();
    this.speedFilter.reset();
    this.headingFilter.reset();
  }

  /** Moves the virtual rider forward by simulated seconds, in small stable steps. */
  private advance(simSeconds: number): void {
    let remaining = simSeconds;
    while (remaining > 1e-9 && this.stateValue === "playing") {
      const dt = Math.min(remaining, MAX_STEP_SECONDS);
      remaining -= dt;
      this.step(dt);
    }
  }

  private step(dt: number): void {
    const target = this.targetSpeedAt(this.distance);
    if (this.speed < target) {
      this.speed = Math.min(target, this.speed + this.accel * dt);
    } else {
      this.speed = Math.max(target, this.speed - this.braking * dt);
    }
    this.distance += this.speed * dt;
    this.elapsed += dt;

    const total = this.index.totalMetres;
    if (this.distance >= total) {
      if (this.loop) {
        this.distance -= total;
      } else {
        this.distance = total;
        this.speed = 0;
        this.stateValue = "finished";
      }
    } else if (!this.loop && total - this.distance <= FINISH_TOLERANCE_METRES) {
      this.distance = total;
      this.speed = 0;
      this.stateValue = "finished";
    }
  }

  /** The fastest the rider may go here, given the cruise speed and the corners ahead. */
  private targetSpeedAt(distanceMetres: number): number {
    const { cumulativeMetres } = this.index;
    const point = locateAlongRoute(this.index, distanceMetres);
    const next = point.segmentIndex + 1;
    const ahead = (cumulativeMetres[next] as number) - distanceMetres;
    const allowedAtNext = this.allowedSpeedAtVertex[next] as number;
    const brakingLimit = Math.sqrt(allowedAtNext ** 2 + 2 * this.braking * Math.max(ahead, 0));
    return Math.min(this.cruiseMps, brakingLimit);
  }

  /**
   * Works out how fast the rider may pass each vertex. Sharp turns cap the speed, the end of a
   * route that does not loop caps it at zero, then a backward pass makes sure the rider can
   * brake in time for every cap.
   */
  private buildSpeedProfile(lateralAccelerationMps2: number): number[] {
    const { path, cumulativeMetres } = this.index;
    const n = path.length;
    const allowed: number[] = new Array<number>(n).fill(this.cruiseMps);
    const bearingAt = (i: number): number =>
      bearingDegrees(path[i] as LatLng, path[i + 1] as LatLng);
    for (let i = 1; i < n - 1; i++) {
      const turn = Math.abs(shortestAngleDelta(bearingAt(i - 1), bearingAt(i))) * (Math.PI / 180);
      const span = Math.min(
        ((cumulativeMetres[i + 1] as number) - (cumulativeMetres[i - 1] as number)) / 2,
        MAX_TURN_SPAN_METRES,
      );
      if (turn > 1e-6 && span > 0) {
        const curvature = turn / span;
        allowed[i] = Math.min(allowed[i] as number, Math.sqrt(lateralAccelerationMps2 / curvature));
      }
    }
    if (this.loop) {
      const turn = Math.abs(shortestAngleDelta(bearingAt(n - 2), bearingAt(0))) * (Math.PI / 180);
      const span = Math.min(
        ((cumulativeMetres[n - 1] as number) -
          (cumulativeMetres[n - 2] as number) +
          ((cumulativeMetres[1] as number) - (cumulativeMetres[0] as number))) /
          2,
        MAX_TURN_SPAN_METRES,
      );
      if (turn > 1e-6 && span > 0) {
        allowed[n - 1] = Math.min(
          allowed[n - 1] as number,
          Math.sqrt(lateralAccelerationMps2 / (turn / span)),
        );
      }
    } else {
      allowed[n - 1] = 0;
    }
    for (let i = n - 2; i >= 0; i--) {
      const gap = (cumulativeMetres[i + 1] as number) - (cumulativeMetres[i] as number);
      const reachable = Math.sqrt((allowed[i + 1] as number) ** 2 + 2 * this.braking * gap);
      allowed[i] = Math.min(allowed[i] as number, reachable);
    }
    return allowed;
  }

  private emitFix(timestamp: number): void {
    const point = locateAlongRoute(this.index, this.distance);
    const std = this.noise;
    const raw: PositionFix = {
      position: this.jitter(point.position, std.positionStdMetres),
      heading: (point.heading + gaussian(this.random, 0, std.headingStdDegrees) + 360) % 360,
      speedMps: Math.max(0, this.speed + gaussian(this.random, 0, std.speedStdMps)),
      timestamp,
    };
    const dtSeconds = this.lastRaw ? (timestamp - this.lastRaw.timestamp) / 1000 : 0;
    this.lastRaw = raw;
    const fix: PositionFix = {
      position: this.positionSmoother.update(raw.position, dtSeconds),
      heading: this.headingFilter.update(raw.heading ?? point.heading, dtSeconds),
      speedMps: this.speedFilter.update(raw.speedMps ?? 0, dtSeconds),
      timestamp,
    };
    this.lastFix = fix;
    for (const listener of this.listeners) listener(fix);
  }

  private jitter(position: LatLng, stdMetres: number): LatLng {
    if (stdMetres <= 0) return position;
    const metresPerDegreeLat = 111_194.9;
    const east = gaussian(this.random, 0, stdMetres);
    const north = gaussian(this.random, 0, stdMetres);
    return {
      lat: position.lat + north / metresPerDegreeLat,
      lng: position.lng + east / (metresPerDegreeLat * Math.cos((position.lat * Math.PI) / 180)),
    };
  }
}

function assertPlaybackSpeed(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new RangeError("Playback speed must be a number above 0.");
  }
  return multiplier;
}
