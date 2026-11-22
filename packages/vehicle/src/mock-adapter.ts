import { createRng, gaussian, kmhToMps, mpsToKmh, systemClock } from "@waylit/core";
import { BatteryModel } from "./energy";
import { DEFAULT_SPEED_LIMIT_KMH, NINEBOT_MAX_G3 } from "./spec";
import type {
  CreateMockVehicleAdapter,
  MockVehicleAdapter,
  TelemetryField,
  Unsubscribe,
  VehicleCapabilities,
  VehicleConnectionState,
  VehicleTelemetry,
} from "./types";

/**
 * Mock adapter that imitates the telemetry of a Segway Ninebot MAX G3 (see `spec.ts` for the
 * figures and their source). It is read-only like every adapter: it has no way to send a
 * command anywhere, and it uses no Bluetooth. It reads the rider's true speed from a motion
 * source, usually the GPS simulator, and derives the rest:
 *
 * - vehicle speed: true speed read a little high, as scooter speedometers tend to, with small
 *   noise, rounded to 0.1 km/h, and never above the speed limit. It is a separate value from
 *   GPS speed on purpose, so the fallback logic has two real sources to choose between.
 * - battery percent, from the energy model in `energy.ts`
 * - estimated range, from remaining energy and recent consumption
 * - trip distance, which is the vehicle speed added up over time, so it drifts from GPS
 *   distance as a real wheel sensor would
 * - trip duration and odometer
 */

const ALL_FIELDS: readonly TelemetryField[] = [
  "speedMps",
  "batteryPercent",
  "rangeMetres",
  "tripDistanceMetres",
  "tripDurationSeconds",
  "odometerMetres",
  "ridingMode",
];

/** Scooter speedometers usually read slightly above true speed. */
const SPEEDOMETER_OVER_READ = 1.03;
const SPEED_NOISE_MPS = 0.03;

export const createMockVehicleAdapter: CreateMockVehicleAdapter = (options = {}) => {
  const clock = options.clock ?? systemClock;
  const sampleIntervalMs = options.sampleIntervalMs ?? 250;
  const speedLimitMps = kmhToMps(options.speedLimitKmh ?? DEFAULT_SPEED_LIMIT_KMH);
  const random = createRng(options.seed ?? 1);
  const battery = new BatteryModel(options.initialBatteryPercent ?? 100);
  const telemetryListeners = new Set<(sample: VehicleTelemetry) => void>();
  const stateListeners = new Set<(state: VehicleConnectionState) => void>();

  let omitted = new Set<TelemetryField>(options.omitFields ?? []);
  let connection: VehicleConnectionState = "disconnected";
  let timer: unknown;
  let lastSampleMs: number | undefined;
  let lastElapsedSeconds = 0;
  let connectedAtMs = 0;
  let tripDistanceMetres = 0;
  let tripDurationSeconds = 0;
  let odometerBaseMetres = options.initialOdometerMetres ?? 0;

  const setConnection = (next: VehicleConnectionState): void => {
    if (connection === next) return;
    connection = next;
    for (const listener of stateListeners) listener(next);
  };

  const readMotion = (): { speedMps: number; elapsedSeconds: number } => {
    if (options.motion) return options.motion.getMotion();
    return { speedMps: 0, elapsedSeconds: (clock.now() - connectedAtMs) / 1000 };
  };

  const capabilities = (): VehicleCapabilities => ({
    fields: ALL_FIELDS.filter((field) => !omitted.has(field)),
  });

  const adapter: MockVehicleAdapter = {
    info: { adapterId: "mock", displayName: NINEBOT_MAX_G3.displayName },

    get capabilities() {
      return capabilities();
    },

    async connect() {
      if (connection === "connected") return;
      setConnection("connecting");
      connectedAtMs = clock.now();
      lastSampleMs = undefined;
      lastElapsedSeconds = readMotion().elapsedSeconds;
      setConnection("connected");
      if (options.scheduler) {
        timer = options.scheduler.setInterval(() => adapter.tick(), sampleIntervalMs);
      }
    },

    async disconnect() {
      if (options.scheduler && timer !== undefined) {
        options.scheduler.clearInterval(timer);
        timer = undefined;
      }
      setConnection("disconnected");
    },

    getConnectionState: () => connection,

    onTelemetry(listener): Unsubscribe {
      telemetryListeners.add(listener);
      return () => {
        telemetryListeners.delete(listener);
      };
    },

    onConnectionStateChange(listener): Unsubscribe {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },

    tick() {
      if (connection !== "connected") return;
      const nowMs = clock.now();
      if (lastSampleMs !== undefined && nowMs - lastSampleMs < sampleIntervalMs) return;
      lastSampleMs = nowMs;

      const motion = readMotion();
      const dt = Math.max(motion.elapsedSeconds - lastElapsedSeconds, 0);
      lastElapsedSeconds = motion.elapsedSeconds;

      const noisy = motion.speedMps * SPEEDOMETER_OVER_READ + gaussian(random, 0, SPEED_NOISE_MPS);
      const limited = Math.min(Math.max(noisy, 0), speedLimitMps);
      const vehicleSpeedMps = kmhToMps(Math.round(mpsToKmh(limited) * 10) / 10);

      tripDistanceMetres += vehicleSpeedMps * dt;
      tripDurationSeconds += dt;
      battery.step(vehicleSpeedMps, dt);

      const values: Partial<Record<TelemetryField, number | string>> = {
        speedMps: vehicleSpeedMps,
        batteryPercent: Math.round(battery.percent),
        rangeMetres: Math.round(battery.rangeMetres),
        tripDistanceMetres: Math.round(tripDistanceMetres),
        tripDurationSeconds: Math.round(tripDurationSeconds),
        odometerMetres: Math.round(odometerBaseMetres + tripDistanceMetres),
        ridingMode: "Sport",
      };
      const sample: Record<string, number | string> = { timestamp: nowMs };
      for (const field of ALL_FIELDS) {
        const value = values[field];
        if (value !== undefined && !omitted.has(field)) sample[field] = value;
      }
      for (const listener of telemetryListeners) listener(sample as unknown as VehicleTelemetry);
    },

    startTrip() {
      odometerBaseMetres += tripDistanceMetres;
      tripDistanceMetres = 0;
      tripDurationSeconds = 0;
    },

    setOmittedFields(fields) {
      omitted = new Set(fields);
    },
  };

  return adapter;
};
