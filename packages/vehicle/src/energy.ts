import { NINEBOT_MAX_G3 } from "./spec";

/**
 * Energy use model for the mock scooter. Energy per kilometre follows a simple curve,
 * `a + b * v squared` with speed v in km/h, fitted exactly through the maker's two claimed
 * range points (see `spec.ts`). On top of that sit a real-world factor, because rider weight,
 * hills, wind and cold make the ideal figures optimistic, and a small constant draw for the
 * display and electronics.
 *
 * This is a plausible mock, not a physical simulation of the real vehicle.
 */

export interface EnergyModelOptions {
  /** Usable battery capacity in watt hours. Default 597. */
  readonly capacityWh?: number;
  /** Multiplier on the maker's ideal consumption. Default 1.5. */
  readonly realWorldFactor?: number;
  /** Constant draw in watts for electronics, also while stopped. Default 3. */
  readonly idleWatts?: number;
}

const [slow, fast] = NINEBOT_MAX_G3.claimedRange;
const whPerKmSlow = NINEBOT_MAX_G3.batteryCapacityWh / slow.rangeKm;
const whPerKmFast = NINEBOT_MAX_G3.batteryCapacityWh / fast.rangeKm;
const curveB = (whPerKmFast - whPerKmSlow) / (fast.speedKmh ** 2 - slow.speedKmh ** 2);
const curveA = whPerKmSlow - curveB * slow.speedKmh ** 2;

/** Ideal consumption in watt hours per kilometre at a steady speed in km/h. */
export function idealWhPerKm(speedKmh: number): number {
  return curveA + curveB * speedKmh ** 2;
}

/** Fallback consumption used for the range estimate before any distance has been ridden. */
const REFERENCE_SPEED_KMH = 18;

/** Tracks the battery of the mock scooter as a ride is fed to it step by step. */
export class BatteryModel {
  readonly capacityWh: number;
  private readonly realWorldFactor: number;
  private readonly idleWatts: number;
  private remainingWh: number;
  private smoothedWhPerKm: number;

  constructor(initialPercent = 100, options: EnergyModelOptions = {}) {
    this.capacityWh = options.capacityWh ?? NINEBOT_MAX_G3.batteryCapacityWh;
    this.realWorldFactor = options.realWorldFactor ?? 1.5;
    this.idleWatts = options.idleWatts ?? 3;
    this.remainingWh = (this.capacityWh * clampPercent(initialPercent)) / 100;
    this.smoothedWhPerKm = idealWhPerKm(REFERENCE_SPEED_KMH) * this.realWorldFactor;
  }

  get percent(): number {
    return (this.remainingWh / this.capacityWh) * 100;
  }

  get remainingEnergyWh(): number {
    return this.remainingWh;
  }

  /** Estimated range in metres at the recent average consumption. */
  get rangeMetres(): number {
    return (this.remainingWh / this.smoothedWhPerKm) * 1000;
  }

  /** Recent average consumption in watt hours per kilometre. */
  get whPerKm(): number {
    return this.smoothedWhPerKm;
  }

  /** Uses the energy for riding at `speedMps` for `dtSeconds`. Never goes below empty. */
  step(speedMps: number, dtSeconds: number): void {
    if (dtSeconds <= 0) return;
    const speedKmh = Math.max(speedMps, 0) * 3.6;
    const distanceKm = (Math.max(speedMps, 0) * dtSeconds) / 1000;
    const rideWh = speedKmh > 0 ? idealWhPerKm(speedKmh) * this.realWorldFactor * distanceKm : 0;
    const idleWh = (this.idleWatts * dtSeconds) / 3600;
    this.remainingWh = Math.max(this.remainingWh - rideWh - idleWh, 0);

    // Blend the recent riding into the estimate, weighted by distance, so range reacts to
    // how the vehicle is being ridden but does not jump around at every sample.
    if (distanceKm > 0) {
      const instant = idealWhPerKm(speedKmh) * this.realWorldFactor;
      const weight = Math.min(distanceKm / 0.5, 1);
      this.smoothedWhPerKm += weight * (instant - this.smoothedWhPerKm);
    }
  }
}

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}
