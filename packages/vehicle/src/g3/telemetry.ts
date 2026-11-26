import { readIntLE, readUintLE } from "./bytes";
import { READ_REGISTERS, type RegisterKey } from "./registers";
import type { VehicleTelemetry } from "../types";

/**
 * Turns register values into the shared `VehicleTelemetry` type, and gathers the latest value of
 * each register into samples.
 *
 * UNVERIFIED SCALES. The documentation gives register numbers and sizes only. The units below are
 * provisional guesses, chosen so that a plausible scooter reads plausible numbers, and they must
 * be checked against the scooter's own display (docs/VEHICLE.md says how). Values that fall
 * outside a sensible range are dropped rather than shown, so a wrong scale shows no number
 * instead of a silly one.
 */
export const G3_SCALES = {
  /** Speed register: signed, in units of 0.1 km/h. */
  speedKmhPerUnit: 0.1,
  /** Battery register: percent. */
  batteryPercentPerUnit: 1,
  /** Total mileage register: metres. */
  totalMileageMetresPerUnit: 1,
  /** Trip mileage register: units of 10 metres. */
  tripMileageMetresPerUnit: 10,
  /** Range register: units of 10 metres. */
  rangeMetresPerUnit: 10,
  /** Temperature register: signed, in units of 0.1 degree Celsius. */
  temperatureCelsiusPerUnit: 0.1,
} as const;

/** Sanity limits. A decoded value beyond these is treated as a wrong scale or a bad read. */
export const G3_LIMITS = {
  maxSpeedKmh: 60,
  maxRangeMetres: 250_000,
  maxTripMetres: 1_000_000,
  minTemperatureCelsius: -30,
  maxTemperatureCelsius: 120,
} as const;

/** One decoded register, or undefined when the value is not believable. */
export type DecodedRegister = Partial<VehicleTelemetry>;

const hex16 = (value: number): string => `0x${value.toString(16).padStart(4, "0")}`;

export function decodeRegister(key: RegisterKey, payload: Uint8Array): DecodedRegister | undefined {
  const size = READ_REGISTERS[key].size;
  if (payload.length < size) return undefined;
  switch (key) {
    case "speed": {
      const kmh = readIntLE(payload, 0, 2) * G3_SCALES.speedKmhPerUnit;
      if (kmh < 0 || kmh > G3_LIMITS.maxSpeedKmh) return undefined;
      return { speedMps: kmh / 3.6 };
    }
    case "battery": {
      const percent = readUintLE(payload, 0, 2) * G3_SCALES.batteryPercentPerUnit;
      return percent <= 100 ? { batteryPercent: percent } : undefined;
    }
    case "totalMileage":
      return {
        odometerMetres: readUintLE(payload, 0, 4) * G3_SCALES.totalMileageMetresPerUnit,
      };
    case "tripMileage": {
      const metres = readUintLE(payload, 0, 2) * G3_SCALES.tripMileageMetresPerUnit;
      return metres <= G3_LIMITS.maxTripMetres ? { tripDistanceMetres: metres } : undefined;
    }
    case "range": {
      const metres = readUintLE(payload, 0, 2) * G3_SCALES.rangeMetresPerUnit;
      return metres <= G3_LIMITS.maxRangeMetres ? { rangeMetres: metres } : undefined;
    }
    case "gearMode":
      // The meaning of the number is not documented, so it is shown as it is.
      return { ridingMode: `Mode ${readUintLE(payload, 0, 2)}` };
    case "temperature": {
      const celsius = readIntLE(payload, 0, 2) * G3_SCALES.temperatureCelsiusPerUnit;
      return celsius >= G3_LIMITS.minTemperatureCelsius &&
        celsius <= G3_LIMITS.maxTemperatureCelsius
        ? { temperatureCelsius: celsius }
        : undefined;
    }
    case "errorCode": {
      const code = readUintLE(payload, 0, 2);
      return { errorCodes: code === 0 ? [] : [hex16(code)] };
    }
    case "warningCode": {
      const code = readUintLE(payload, 0, 2);
      return { warningCodes: code === 0 ? [] : [hex16(code)] };
    }
  }
}

/** How long a register's value counts as current, in milliseconds. Speed must be fresh. */
export const FIELD_MAX_AGE_MS: Readonly<Record<RegisterKey, number>> = {
  speed: 1500,
  battery: 20_000,
  totalMileage: 60_000,
  tripMileage: 10_000,
  range: 20_000,
  gearMode: 20_000,
  temperature: 30_000,
  errorCode: 20_000,
  warningCode: 20_000,
};

interface Held {
  readonly value: DecodedRegister;
  readonly at: number;
}

/**
 * Keeps the latest value of each register and builds samples from the ones that are still
 * current. A sample's timestamp is the time it was built, so speed is left out once it is older
 * than its limit, and `selectSpeed` then falls back to GPS. `clear` forgets everything, which is
 * done when the link drops so nothing old is ever shown again.
 */
export class TelemetryAccumulator {
  private readonly held = new Map<RegisterKey, Held>();

  update(key: RegisterKey, value: DecodedRegister, nowMs: number): void {
    this.held.set(key, { value, at: nowMs });
  }

  /** A sample of everything current, or undefined when nothing is. */
  sample(nowMs: number): VehicleTelemetry | undefined {
    let merged: DecodedRegister = {};
    let any = false;
    for (const [key, held] of this.held) {
      if (nowMs - held.at > FIELD_MAX_AGE_MS[key]) continue;
      merged = { ...merged, ...held.value };
      any = true;
    }
    return any ? { ...merged, timestamp: nowMs } : undefined;
  }

  clear(): void {
    this.held.clear();
  }
}
