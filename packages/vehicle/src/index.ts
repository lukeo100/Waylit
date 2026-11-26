export type {
  CreateMockVehicleAdapter,
  MockVehicleAdapter,
  MockVehicleAdapterOptions,
  MotionSource,
  TelemetryField,
  Unsubscribe,
  VehicleAdapter,
  VehicleCapabilities,
  VehicleConnectionState,
  VehicleInfo,
  VehicleTelemetry,
} from "./types";
export { createMockVehicleAdapter } from "./mock-adapter";
export { BatteryModel, idealWhPerKm } from "./energy";
export type { EnergyModelOptions } from "./energy";
export { DEFAULT_SPEED_LIMIT_KMH, NINEBOT_MAX_G3 } from "./spec";
export {
  DEFAULT_GPS_STALE_MS,
  DEFAULT_TELEMETRY_STALE_MS,
  isTelemetryStale,
  selectSpeed,
} from "./speed-selection";
export type { SelectedSpeed, SelectSpeedInput, SpeedFallbackReason } from "./speed-selection";
export { START_GPS_GRACE_METRES, TripTracker } from "./trip";
export type { TripFallbackReason, TripReading, TripUpdate } from "./trip";
export * from "./g3/index";
