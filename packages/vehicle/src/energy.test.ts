import { describe, expect, it } from "vitest";
import { kmhToMps } from "@waylit/core";
import { BatteryModel, idealWhPerKm } from "./energy";
import { NINEBOT_MAX_G3 } from "./spec";

describe("idealWhPerKm", () => {
  it("matches the maker's two claimed range points", () => {
    for (const { speedKmh, rangeKm } of NINEBOT_MAX_G3.claimedRange) {
      expect(NINEBOT_MAX_G3.batteryCapacityWh / idealWhPerKm(speedKmh)).toBeCloseTo(rangeKm, 6);
    }
  });

  it("rises with speed", () => {
    expect(idealWhPerKm(25)).toBeGreaterThan(idealWhPerKm(15));
    expect(idealWhPerKm(15)).toBeGreaterThan(idealWhPerKm(5));
  });
});

describe("BatteryModel", () => {
  it("starts at the requested percent and clamps it", () => {
    expect(new BatteryModel(80).percent).toBeCloseTo(80, 9);
    expect(new BatteryModel(150).percent).toBe(100);
    expect(new BatteryModel(-5).percent).toBe(0);
  });

  it("uses the maker's energy per km when the real-world factor is 1 and idle draw is 0", () => {
    const b = new BatteryModel(100, { realWorldFactor: 1, idleWatts: 0 });
    // Ride 6.5 km at 25 km/h, a tenth of the claimed 65 km range.
    b.step(kmhToMps(25), (6.5 / 25) * 3600);
    expect(b.percent).toBeCloseTo(90, 4);
  });

  it("drains faster at higher speed over the same distance", () => {
    const slow = new BatteryModel(100);
    const fast = new BatteryModel(100);
    slow.step(kmhToMps(12), 3600 / 12);
    fast.step(kmhToMps(25), 3600 / 25);
    expect(fast.percent).toBeLessThan(slow.percent);
  });

  it("drains slowly while stopped", () => {
    const b = new BatteryModel(100, { idleWatts: 3 });
    b.step(0, 3600);
    expect(100 - b.percent).toBeCloseTo((3 / 597) * 100, 6);
  });

  it("never goes below empty and reports no range when empty", () => {
    const b = new BatteryModel(1);
    for (let i = 0; i < 100; i++) b.step(kmhToMps(25), 60);
    expect(b.percent).toBe(0);
    expect(b.rangeMetres).toBe(0);
  });

  it("estimates a plausible range from a full battery", () => {
    const km = new BatteryModel(100).rangeMetres / 1000;
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(80);
  });

  it("range shrinks as the battery drains and tracks recent riding", () => {
    const b = new BatteryModel(100);
    const full = b.rangeMetres;
    for (let i = 0; i < 600; i++) b.step(kmhToMps(25), 1);
    expect(b.rangeMetres).toBeLessThan(full);
    // Ridden distance plus remaining range should stay close to the first estimate.
    const ridden = kmhToMps(25) * 600;
    expect(Math.abs(ridden + b.rangeMetres - full) / full).toBeLessThan(0.15);
  });

  it("ignores zero or negative time steps", () => {
    const b = new BatteryModel(50);
    b.step(10, 0);
    b.step(10, -1);
    expect(b.percent).toBe(50);
  });
});
