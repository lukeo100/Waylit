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
export { DEFAULT_GPS_STALE_MS, DEFAULT_TELEMETRY_STALE_MS, selectSpeed } from "./speed-selection";
export type { SelectedSpeed, SelectSpeedInput, SpeedFallbackReason } from "./speed-selection";
