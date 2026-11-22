/**
 * Vehicle interface. Placeholder types only.
 *
 * Safety rule: this interface is read-only. It exposes telemetry and connection state
 * and has no methods that send commands to a vehicle. Do not add any method that writes
 * to firmware, braking, throttle, lights or other vehicle systems without a maintainer
 * agreement recorded in an issue.
 */

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
  /** Lifetime odometer in metres. */
  readonly odometerMetres?: number;
  /** Riding mode name as the vehicle reports it, for display only. */
  readonly ridingMode?: string;
  /** Controller or battery temperature in degrees Celsius. */
  readonly temperatureCelsius?: number;
  /** Raw error codes for display. Never interpreted as commands. */
  readonly errorCodes?: readonly string[];
  /** Milliseconds since the Unix epoch when this sample was taken. */
  readonly timestamp: number;
}

export type TelemetryField = Exclude<keyof VehicleTelemetry, "timestamp">;

export type VehicleConnectionState = "disconnected" | "connecting" | "connected" | "error";

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
 * Options for the mock adapter. The mock adapter itself is implemented in the
 * simulation task (task 7). These types fix its shape early so UI work can target it.
 */
export interface MockVehicleAdapterOptions {
  /** Interval between telemetry samples in milliseconds. */
  readonly sampleIntervalMs?: number;
  /** Starting battery percent, 0 to 100. */
  readonly initialBatteryPercent?: number;
  /** Fields to omit, to exercise the GPS fallback path. */
  readonly omitFields?: readonly TelemetryField[];
}

export type CreateMockVehicleAdapter = (options?: MockVehicleAdapterOptions) => VehicleAdapter;
