import { systemClock, type Clock } from "./clock";
import { bearingDegrees, haversineDistance } from "./geo";
import type { GpsStatus, FixSource } from "./position-source";
import { AngleLowPassFilter, LowPassFilter, PositionSmoother } from "./smoothing";
import type { PositionFix } from "./types";

/**
 * Live phone GPS, from the browser's Geolocation API. Written from the public W3C Geolocation
 * specification only. All the logic is here and the browser object is passed in, so tests feed
 * it fake positions and a manual clock.
 *
 * Privacy: fixes live in memory and go to listeners on this device. Nothing here stores, logs
 * or sends a position, and nothing keeps a trace.
 *
 * What it does with each reported position:
 *  - drops bad numbers, and fixes with an accuracy radius worse than `maxAccuracyMetres`
 *  - flags fixes worse than `goodAccuracyMetres` as weak (they are still used, smoothed)
 *  - takes speed from `coords.speed`, or from distance over time when the browser gives none,
 *    then smooths it, and treats a tiny speed as standing still
 *  - takes heading from `coords.heading`, or from the direction of travel, only above
 *    `minHeadingSpeedMps`; below that it holds the last heading, smoothed
 *  - notices when fixes stop (stale) and when they come back
 */

/** The parts of a browser `GeolocationPosition` that are used. */
export interface GeolocationPositionLike {
  readonly coords: {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracy: number;
    readonly altitude: number | null;
    readonly altitudeAccuracy: number | null;
    readonly heading: number | null;
    readonly speed: number | null;
  };
  readonly timestamp: number;
}

/** The parts of a browser `GeolocationPositionError` that are used. */
export interface GeolocationErrorLike {
  /** 1 permission denied, 2 position unavailable, 3 timeout. */
  readonly code: number;
}

export interface GeolocationWatchOptions {
  readonly enableHighAccuracy: boolean;
  readonly maximumAge: number;
  readonly timeout: number;
}

/** The parts of `navigator.geolocation` that are used. */
export interface GeolocationLike {
  watchPosition(
    success: (position: GeolocationPositionLike) => void,
    error: (error: GeolocationErrorLike) => void,
    options: GeolocationWatchOptions,
  ): number;
  clearWatch(id: number): void;
}

export interface LiveGpsOptions {
  /** `navigator.geolocation`, a replay, or undefined when the browser has none. */
  readonly geolocation: GeolocationLike | undefined;
  readonly clock?: Clock;
  /** Fixes with a worse accuracy radius than this are dropped, in metres. Default 50. */
  readonly maxAccuracyMetres?: number;
  /** Fixes with a worse accuracy radius than this are flagged weak, in metres. Default 25. */
  readonly goodAccuracyMetres?: number;
  /** No fix for this long means stale, in milliseconds. Default 8000. */
  readonly staleAfterMs?: number;
  /** Below this speed the heading is held, in m/s. Default 1. */
  readonly minHeadingSpeedMps?: number;
  /** A speed under this counts as standing still, in m/s. Default 0.5. */
  readonly stationarySpeedMps?: number;
  /** Highest speed accepted, in m/s. Faster is a glitch. Default 40 (144 km/h). */
  readonly maxSpeedMps?: number;
}

/** What is asked of the browser. High accuracy, a fresh fix each second, and a generous timeout. */
export const WATCH_OPTIONS: GeolocationWatchOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10_000,
};

export type GpsStatusListener = (status: GpsStatus) => void;

export class LiveGpsSource implements FixSource {
  private readonly clock: Clock;
  private readonly geolocation: GeolocationLike | undefined;
  private readonly maxAccuracy: number;
  private readonly goodAccuracy: number;
  private readonly staleAfterMs: number;
  private readonly minHeadingSpeed: number;
  private readonly stationarySpeed: number;
  private readonly maxSpeed: number;

  private readonly smoother = new PositionSmoother();
  private readonly speedFilter = new LowPassFilter(1.5);
  private readonly headingFilter = new AngleLowPassFilter(1);
  private readonly fixListeners = new Set<(fix: PositionFix) => void>();
  private readonly statusListeners = new Set<GpsStatusListener>();

  private statusValue: GpsStatus = "idle";
  private watchId: number | undefined;
  private startedAtMs = 0;
  private lastFixAtMs: number | undefined;
  private lastRawPosition: { lat: number; lng: number } | undefined;
  private lastRawAtMs: number | undefined;
  private lastFix: PositionFix | undefined;
  private lastAccuracy: number | undefined;
  private dropped = 0;
  private speedMps = 0;

  constructor(options: LiveGpsOptions) {
    this.clock = options.clock ?? systemClock;
    this.geolocation = options.geolocation;
    this.maxAccuracy = options.maxAccuracyMetres ?? 50;
    this.goodAccuracy = options.goodAccuracyMetres ?? 25;
    this.staleAfterMs = options.staleAfterMs ?? 8000;
    this.minHeadingSpeed = options.minHeadingSpeedMps ?? 1;
    this.stationarySpeed = options.stationarySpeedMps ?? 0.5;
    this.maxSpeed = options.maxSpeedMps ?? 40;
  }

  get status(): GpsStatus {
    return this.statusValue;
  }

  /** Accuracy radius of the latest reported position in metres, or undefined. */
  get accuracyMetres(): number | undefined {
    return this.lastAccuracy;
  }

  /** How many reported positions were dropped for poor accuracy or bad numbers. */
  get droppedCount(): number {
    return this.dropped;
  }

  /**
   * Starts watching. Call it from a tap or click, so the browser may show its permission
   * prompt. A second call while running does nothing.
   */
  start(): void {
    if (this.watchId !== undefined) return;
    this.resetState();
    if (this.geolocation === undefined) {
      this.setStatus("unavailable");
      return;
    }
    this.startedAtMs = this.clock.now();
    this.setStatus("requesting");
    try {
      this.watchId = this.geolocation.watchPosition(
        (position) => {
          this.handlePosition(position);
        },
        (error) => {
          this.handleError(error);
        },
        WATCH_OPTIONS,
      );
    } catch {
      this.setStatus("unavailable");
    }
  }

  stop(): void {
    if (this.watchId !== undefined) this.geolocation?.clearWatch(this.watchId);
    this.watchId = undefined;
    this.resetState();
    this.setStatus("idle");
  }

  /** Checks for stale fixes and returns the latest smoothed fix. */
  update(): PositionFix | undefined {
    if (
      (this.statusValue === "active" || this.statusValue === "weak") &&
      this.lastFixAtMs !== undefined &&
      this.clock.now() - this.lastFixAtMs > this.staleAfterMs
    ) {
      this.setStatus("stale");
    }
    return this.lastFix;
  }

  getLastFix(): PositionFix | undefined {
    return this.lastFix;
  }

  /** Speed and time since start, the shape the mock vehicle adapter reads. */
  getMotion(): { readonly speedMps: number; readonly elapsedSeconds: number } {
    const running = this.watchId !== undefined;
    return {
      speedMps: this.statusValue === "stale" ? 0 : this.speedMps,
      elapsedSeconds: running ? Math.max(0, (this.clock.now() - this.startedAtMs) / 1000) : 0,
    };
  }

  onFix(listener: (fix: PositionFix) => void): () => void {
    this.fixListeners.add(listener);
    return () => {
      this.fixListeners.delete(listener);
    };
  }

  onStatus(listener: GpsStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private resetState(): void {
    this.smoother.reset();
    this.speedFilter.reset();
    this.headingFilter.reset();
    this.lastFixAtMs = undefined;
    this.lastRawPosition = undefined;
    this.lastRawAtMs = undefined;
    this.lastFix = undefined;
    this.lastAccuracy = undefined;
    this.dropped = 0;
    this.speedMps = 0;
  }

  private setStatus(next: GpsStatus): void {
    if (this.statusValue === next) return;
    this.statusValue = next;
    for (const listener of this.statusListeners) listener(next);
  }

  private handleError(error: GeolocationErrorLike): void {
    if (error.code === 1) {
      // Permission denied. Stop watching, there is nothing more to wait for.
      if (this.watchId !== undefined) this.geolocation?.clearWatch(this.watchId);
      this.watchId = undefined;
      this.setStatus("denied");
      return;
    }
    if (this.lastFix === undefined) {
      // Position unavailable or a timeout before any fix: no usable signal yet.
      this.setStatus(error.code === 2 ? "unavailable" : "weak");
    }
    // With an earlier fix, the stale check in `update()` decides.
  }

  private handlePosition(position: GeolocationPositionLike): void {
    const c = position.coords;
    const nowMs = this.clock.now();
    if (
      !Number.isFinite(c.latitude) ||
      !Number.isFinite(c.longitude) ||
      Math.abs(c.latitude) > 90 ||
      Math.abs(c.longitude) > 180
    ) {
      this.dropped += 1;
      return;
    }
    const accuracy = Number.isFinite(c.accuracy) && c.accuracy >= 0 ? c.accuracy : undefined;
    this.lastAccuracy = accuracy;
    // Any report counts as the receiver being alive, even one that is too poor to use.
    this.lastFixAtMs = nowMs;
    if (accuracy !== undefined && accuracy > this.maxAccuracy) {
      this.dropped += 1;
      this.setStatus("weak");
      return;
    }

    const raw = { lat: c.latitude, lng: c.longitude };
    const previous = this.lastRawPosition;
    const dtSeconds =
      this.lastRawAtMs === undefined ? 0 : Math.max((nowMs - this.lastRawAtMs) / 1000, 0);

    // Speed over ground.
    let rawSpeed: number | undefined;
    if (c.speed !== null && Number.isFinite(c.speed) && c.speed >= 0) {
      rawSpeed = c.speed;
    } else if (previous !== undefined && dtSeconds >= 0.3 && dtSeconds <= 15) {
      rawSpeed = haversineDistance(previous, raw) / dtSeconds;
    }
    if (rawSpeed !== undefined) {
      rawSpeed = Math.min(rawSpeed, this.maxSpeed);
      const smoothed = this.speedFilter.update(rawSpeed, dtSeconds || 1);
      this.speedMps = smoothed < this.stationarySpeed ? 0 : smoothed;
    }

    // Heading: only while moving.
    if (this.speedMps >= this.minHeadingSpeed) {
      let rawHeading: number | undefined;
      if (c.heading !== null && Number.isFinite(c.heading) && c.heading >= 0) {
        rawHeading = c.heading;
      } else if (previous !== undefined && haversineDistance(previous, raw) >= 2) {
        rawHeading = bearingDegrees(previous, raw);
      }
      if (rawHeading !== undefined) this.headingFilter.update(rawHeading, dtSeconds || 1);
    }

    const smoothedPosition = this.smoother.update(raw, dtSeconds);
    this.lastRawPosition = raw;
    this.lastRawAtMs = nowMs;

    const heading = this.headingFilter.value;
    const fix: PositionFix = {
      position: {
        lat: smoothedPosition.lat,
        lng: smoothedPosition.lng,
        ...(c.altitude !== null && Number.isFinite(c.altitude) ? { altitude: c.altitude } : {}),
        ...(accuracy !== undefined ? { accuracy } : {}),
        ...(c.altitudeAccuracy !== null && Number.isFinite(c.altitudeAccuracy)
          ? { altitudeAccuracy: c.altitudeAccuracy }
          : {}),
      },
      ...(heading !== undefined ? { heading } : {}),
      speedMps: this.speedMps,
      timestamp: nowMs,
    };
    this.lastFix = fix;
    this.setStatus(accuracy !== undefined && accuracy > this.goodAccuracy ? "weak" : "active");
    for (const listener of this.fixListeners) listener(fix);
  }
}
