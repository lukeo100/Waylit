import {
  DEMO_ROUTE,
  GpsDistanceIntegrator,
  GpsSimulator,
  averageSpeedKmh,
  computeProgress,
  createProgressModel,
  kmhToMps,
  mpsToKmh,
  projectOntoRoute,
  systemClock,
  type Clock,
  type LatLng,
  type NavigationProgress,
  type PositionFix,
  type ProgressModel,
  type Route,
} from "@waylit/core";
import {
  TripTracker,
  createMockVehicleAdapter,
  isTelemetryStale,
  selectSpeed,
  type MockVehicleAdapter,
  type SelectedSpeed,
  type TripReading,
  type VehicleTelemetry,
} from "@waylit/vehicle";
import { nextGuardState } from "./guard";

/**
 * One simulated ride, from the start screen to the trip summary. It wires the simulation layer
 * together: the GPS simulator, the mock vehicle adapter, the speed and trip distance fallbacks
 * and route progress. It has no timers and no DOM. A caller calls `tick()` a few times a
 * second and reads the snapshot, so tests can drive it with a manual clock.
 */

export type RidePhase = "idle" | "riding" | "summary";

/** Where a finished trip's distance came from: the scooter, GPS, or a mix of the two. */
export type SummaryDistanceSource = "vehicle" | "gps" | "mixed";

export interface TripSummary {
  readonly distanceMetres: number;
  readonly durationSeconds: number;
  readonly averageSpeedKmh: number;
  /**
   * Where the distance came from over the whole trip, so the summary can say when GPS was used
   * at any point. It is not just the last source: a trip that lost the scooter for a while and
   * got it back is "mixed".
   */
  readonly distanceSource: SummaryDistanceSource;
}

/** Works out the summary source from what the trip tracker counted. */
export function summaryDistanceSource(trip: TripReading): SummaryDistanceSource {
  if (!trip.usedGps) return "vehicle";
  // Under a metre from the scooter is treated as none, so rounding noise does not read as a mix.
  return trip.distanceMetres - trip.gpsDistanceMetres < 1 ? "gps" : "mixed";
}

/** Everything the HUD needs to draw one frame. */
export interface RideSnapshot {
  readonly phase: RidePhase;
  readonly vehicleName: string;
  /** Latest smoothed GPS position and heading, once the ride has started. */
  readonly position?: LatLng | undefined;
  readonly heading?: number | undefined;
  /** GPS speed, kept apart from the vehicle's own speed. */
  readonly gpsSpeedMps?: number | undefined;
  /** The speed for the headline figure, and where it came from. */
  readonly speed: SelectedSpeed;
  /** Live vehicle telemetry. Undefined when none has arrived or it has gone stale. */
  readonly telemetry?: VehicleTelemetry | undefined;
  readonly progress: NavigationProgress;
  readonly trip: TripReading;
  /** True while secondary controls need a deliberate press. */
  readonly guarded: boolean;
  /** Present once the trip has ended. */
  readonly summary?: TripSummary | undefined;
  /** Dev settings, echoed so the dev controls can show them. */
  readonly playbackSpeed: number;
  readonly telemetryLost: boolean;
}

export interface RideSessionOptions {
  readonly route?: Route;
  readonly clock?: Clock;
  readonly playbackSpeed?: number;
  readonly seed?: number;
}

/** Expected pace before the ride has shown its own, in km/h. Close to the simulator's average. */
const DEFAULT_PACE_KMH = 18;
/** Pace is only taken from the ride once it has this much history. */
const PACE_MIN_SECONDS = 30;
const PACE_MIN_METRES = 100;
/** Pace is kept inside this range so one slow patch does not swing the estimate. */
const PACE_RANGE_MPS = { min: kmhToMps(8), max: kmhToMps(25) } as const;

export class RideSession {
  private readonly clock: Clock;
  private readonly route: Route;
  private readonly model: ProgressModel;
  private readonly seed: number;

  private sim!: GpsSimulator;
  private vehicle!: MockVehicleAdapter;
  private readonly gpsDistance = new GpsDistanceIntegrator();
  private readonly tripTracker = new TripTracker();
  private unsubscribes: (() => void)[] = [];

  private phase: RidePhase = "idle";
  private playbackSpeed: number;
  private telemetryLost = false;
  private guarded = false;
  private lastTelemetry: VehicleTelemetry | undefined;
  private along = 0;
  private summary: TripSummary | undefined;
  private current!: RideSnapshot;

  constructor(options: RideSessionOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.route = options.route ?? DEMO_ROUTE;
    this.model = createProgressModel(this.route);
    this.playbackSpeed = options.playbackSpeed ?? 1;
    this.seed = options.seed ?? 1;
    this.build();
    this.current = this.compute();
  }

  /** The latest snapshot. It is replaced, never changed, so it is safe to compare by identity. */
  getSnapshot(): RideSnapshot {
    return this.current;
  }

  /** Advances the simulation to the clock and returns a fresh snapshot. */
  tick(): RideSnapshot {
    if (this.phase === "summary") return this.current;
    this.advance();
    this.current = this.compute();
    return this.current;
  }

  /** Begins the simulated trip from the start of the route. */
  start(): void {
    if (this.phase !== "idle") return;
    this.phase = "riding";
    this.tripTracker.reset();
    this.gpsDistance.reset();
    this.along = 0;
    this.guarded = false;
    this.vehicle.startTrip();
    this.sim.start();
    this.tick();
  }

  /**
   * Ends the trip. Stops the simulator, takes the summary and freezes the snapshot. Returns
   * undefined if no trip was running.
   */
  endTrip(): TripSummary | undefined {
    if (this.phase !== "riding") return undefined;
    this.advance();
    const trip = this.tripTracker.reading;
    this.summary = {
      distanceMetres: trip.distanceMetres,
      durationSeconds: trip.durationSeconds,
      averageSpeedKmh: averageSpeedKmh(trip.distanceMetres, trip.durationSeconds),
      distanceSource: summaryDistanceSource(trip),
    };
    this.sim.stop();
    this.phase = "summary";
    this.guarded = false;
    this.current = this.compute();
    return this.summary;
  }

  /** Returns to the start state, ready for a new trip. Dev settings are kept. */
  reset(): void {
    this.teardown();
    this.phase = "idle";
    this.summary = undefined;
    this.guarded = false;
    this.along = 0;
    this.build();
    this.tripTracker.reset();
    this.gpsDistance.reset();
    this.current = this.compute();
  }

  /** Dev control: changes how fast the simulated ride runs. */
  setPlaybackSpeed(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier <= 0) return;
    this.playbackSpeed = multiplier;
    this.sim.setPlaybackSpeed(multiplier);
    this.current = this.compute();
  }

  /** Dev control: stops vehicle telemetry arriving, to show the GPS fallback. */
  setTelemetryLost(lost: boolean): void {
    this.telemetryLost = lost;
    this.current = this.compute();
  }

  /** Releases the simulator and the vehicle link. Call when the screen goes away. */
  dispose(): void {
    this.teardown();
  }

  private build(): void {
    this.sim = new GpsSimulator({
      path: this.route.path,
      clock: this.clock,
      playbackSpeed: this.playbackSpeed,
      seed: this.seed,
    });
    this.vehicle = createMockVehicleAdapter({
      motion: this.sim,
      clock: this.clock,
      seed: this.seed,
    });
    this.lastTelemetry = undefined;
    this.unsubscribes = [
      this.sim.onFix((fix) => {
        if (this.phase === "riding") this.gpsDistance.add(fix);
      }),
      // A lost link simply stops samples arriving. The last one then goes stale.
      this.vehicle.onTelemetry((sample) => {
        if (!this.telemetryLost) this.lastTelemetry = sample;
      }),
    ];
    // The mock connects in the same call, so telemetry is flowing before the trip starts and
    // the dashboard has real values on the start screen.
    void this.vehicle.connect();
    this.vehicle.tick();
  }

  private teardown(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
    void this.vehicle.disconnect();
    this.sim.stop();
  }

  private advance(): void {
    this.sim.update();
    this.vehicle.tick();
    if (this.phase !== "riding") return;
    const nowMs = this.clock.now();
    const fix = this.sim.getLastFix();
    if (fix) {
      this.along = this.sim.state === "finished" ? this.model.index.totalMetres : this.project(fix);
    }
    this.tripTracker.update({
      vehicle: this.lastTelemetry,
      gpsDistanceMetres: this.gpsDistance.distanceMetres,
      rideElapsedSeconds: this.sim.getMotion().elapsedSeconds,
      nowMs,
    });
  }

  private project(fix: PositionFix): number {
    const projected = projectOntoRoute(this.model.index, fix.position, {
      hintMetres: this.along,
    });
    // The rider only moves forward, so a little GPS wobble must not move the position back.
    return Math.max(this.along, projected.distanceMetres);
  }

  private compute(): RideSnapshot {
    const nowMs = this.clock.now();
    const fix = this.phase === "riding" ? this.sim.getLastFix() : undefined;
    const telemetry =
      this.lastTelemetry !== undefined && !isTelemetryStale(this.lastTelemetry, nowMs)
        ? this.lastTelemetry
        : undefined;
    const speed = selectSpeed({ vehicle: this.lastTelemetry, gps: fix, nowMs });
    const trip = this.tripTracker.reading;
    this.guarded =
      this.phase === "riding"
        ? nextGuardState(
            this.guarded,
            speed.speedMps === undefined ? undefined : mpsToKmh(speed.speedMps),
          )
        : false;

    const progress = computeProgress(this.model, {
      distanceAlongMetres: this.along,
      paceMps: this.pace(trip),
      nowMs,
    });

    return {
      phase: this.phase,
      vehicleName: this.vehicle.info.displayName,
      position: fix?.position,
      heading: fix?.heading,
      gpsSpeedMps: fix?.speedMps,
      speed,
      telemetry,
      progress,
      trip,
      guarded: this.guarded,
      summary: this.summary,
      playbackSpeed: this.playbackSpeed,
      telemetryLost: this.telemetryLost,
    };
  }

  private pace(trip: TripReading): number {
    if (trip.durationSeconds >= PACE_MIN_SECONDS && trip.distanceMetres >= PACE_MIN_METRES) {
      const average = trip.distanceMetres / trip.durationSeconds;
      return Math.min(Math.max(average, PACE_RANGE_MPS.min), PACE_RANGE_MPS.max);
    }
    return kmhToMps(DEFAULT_PACE_KMH);
  }
}

/** A fixed snapshot for server rendering and the first client render, so they always match. */
export function createEmptySnapshot(route: Route = DEMO_ROUTE): RideSnapshot {
  return {
    phase: "idle",
    vehicleName: "",
    speed: { speedMps: undefined, source: undefined },
    progress: {
      distanceAlongMetres: 0,
      remainingDistanceMetres: route.distanceMetres,
      arrived: false,
    },
    trip: {
      distanceMetres: 0,
      durationSeconds: 0,
      distanceSource: "gps",
      durationSource: "gps",
      usedGps: false,
      gpsDistanceMetres: 0,
    },
    guarded: false,
    playbackSpeed: 1,
    telemetryLost: false,
  };
}
