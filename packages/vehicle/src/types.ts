/**
 * Vehicle interface types.
 *
 * Safety rule: this interface is read-only. It exposes telemetry and connection state
 * and has no methods that send commands to a vehicle. Do not add any method that writes
 * to firmware, braking, throttle, lights or other vehicle systems without a maintainer
 * agreement recorded in an issue.
 */
import type { Clock, Scheduler } from "@waylit/core";

/** Telemetry fields a vehicle may report. Every field is optional because support varies. */
export interface VehicleTelemetry {
  /** Vehicle-reported speed in metres per second. Kept separate from GPS speed. */
  readonly speedMps?: number;
  /** Battery state of charge, 0 to 100. */
  readonly batteryPercent?: number;
  /** Estimated remaining range in metres. */
  readonly rangeMetres?: number;
  /** Trip distance in metres as reported by the vehicle. */
  readonly tripDistanceMetres?: number;
  /** Trip duration in seconds as reported by the vehicle. */
  readonly tripDurationSeconds?: number;
  /** Lifetime odometer in metres. */
  readonly odometerMetres?: number;
  /** Riding mode name as the vehicle reports it, for display only. */
  readonly ridingMode?: string;
  /** Controller or battery temperature in degrees Celsius. */
  readonly temperatureCelsius?: number;
  /** Raw error codes for display. Never interpreted as commands. */
  readonly errorCodes?: readonly string[];
  /** Raw warning codes for display. Never interpreted as commands. */
  readonly warningCodes?: readonly string[];
  /** Milliseconds since the Unix epoch when this sample was taken. */
  readonly timestamp: number;
}

export type TelemetryField = Exclude<keyof VehicleTelemetry, "timestamp">;

/**
 * Where a vehicle link stands. The mock adapter only uses `disconnected`, `connecting`,
 * `connected` and `error`. A Bluetooth adapter also reports:
 *
 * - `idle`: nothing has been tried yet in this session
 * - `authenticating`: connected over Bluetooth, the encrypted session is being set up
 * - `auth-needed`: the vehicle needs this phone to be paired, or rejected the stored pairing
 * - `unsupported`: this browser or page cannot use Bluetooth for this
 */
export type VehicleConnectionState =
  | "idle"
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected"
  | "auth-needed"
  | "unsupported"
  | "error";

/** Static description of what an adapter can provide. */
export interface VehicleCapabilities {
  readonly fields: readonly TelemetryField[];
}

export interface VehicleInfo {
  /** Adapter identifier, for example "mock". */
  readonly adapterId: string;
  /** Human readable model name, as supplied by the user or the adapter. */
  readonly displayName: string;
}

export type Unsubscribe = () => void;

/**
 * An adapter connects to one kind of vehicle and reports telemetry.
 * When an adapter is missing or disconnected, the app falls back to GPS-derived values.
 */
export interface VehicleAdapter {
  readonly info: VehicleInfo;
  readonly capabilities: VehicleCapabilities;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionState(): VehicleConnectionState;
  onTelemetry(listener: (sample: VehicleTelemetry) => void): Unsubscribe;
  onConnectionStateChange(listener: (state: VehicleConnectionState) => void): Unsubscribe;
}

/**
 * Source of the rider's true motion that the mock adapter turns into telemetry. The GPS
 * simulator in `@waylit/core` fits this shape through `getMotion()`, but anything that
 * provides it will do.
 */
export interface MotionSource {
  /**
   * True speed over ground in metres per second, and simulated seconds elapsed. Elapsed time
   * counts playback speed and leaves out pauses, so the vehicle drains and counts the trip
   * on the same timeline as the ride.
   */
  getMotion(): { readonly speedMps: number; readonly elapsedSeconds: number };
}

/** Options for the mock adapter, which is implemented in `mock-adapter.ts`. */
export interface MockVehicleAdapterOptions {
  /** Where true motion comes from. Without one the mock vehicle sits still. */
  readonly motion?: MotionSource;
  /** Time source for sample timestamps. Defaults to the system clock. */
  readonly clock?: Clock;
  /**
   * Runs the adapter on a timer while connected. Without one, the caller drives it by
   * calling `tick()`.
   */
  readonly scheduler?: Scheduler;
  /** Interval between telemetry samples in milliseconds. Default 250. */
  readonly sampleIntervalMs?: number;
  /** Starting battery percent, 0 to 100. Default 100. */
  readonly initialBatteryPercent?: number;
  /** Speed limit in km/h that the vehicle will not exceed. Default 25, a common legal limit. */
  readonly speedLimitKmh?: number;
  /** Odometer reading at the start of the trip, in metres. Default 0. */
  readonly initialOdometerMetres?: number;
  /** Seed for the small measurement noise. Default 1. */
  readonly seed?: number;
  /** Fields to omit, to exercise the GPS fallback path. */
  readonly omitFields?: readonly TelemetryField[];
}

/** The mock adapter adds manual control on top of the read-only interface. */
export interface MockVehicleAdapter extends VehicleAdapter {
  /** Catches up to the motion source and emits a sample if the sample interval has passed. */
  tick(): void;
  /** Starts a new trip: zero trip distance and duration. Battery and odometer carry on. */
  startTrip(): void;
  /** Stops reporting some fields from now on, for example to simulate a lost signal. */
  setOmittedFields(fields: readonly TelemetryField[]): void;
}

export type CreateMockVehicleAdapter = (options?: MockVehicleAdapterOptions) => MockVehicleAdapter;
