import { describe, expect, it } from "vitest";
import {
  HOLO_CYAN,
  HOLO_CYAN_BRIGHT,
  HOLO_RIBBON,
  HOLO_RIBBON_ALPHA,
  SCAN_PERIOD_MS,
  SCAN_SWEEP_SHARE,
  pulse01,
  scanBandPosition,
} from "./holo";

describe("scanBandPosition", () => {
  it("sweeps up once per period and then rests", () => {
    const samples: number[] = [];
    for (let t = 0; t < SCAN_PERIOD_MS * SCAN_SWEEP_SHARE; t += 100) {
      samples.push(scanBandPosition(t));
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
    }
    expect(samples[0]).toBeLessThan(0);
    expect(samples[samples.length - 1]).toBeGreaterThan(1);
    // Resting part of the period.
    expect(scanBandPosition(SCAN_PERIOD_MS * 0.9)).toBeLessThan(0);
  });

  it("repeats every period and handles odd input", () => {
    expect(scanBandPosition(1234)).toBeCloseTo(scanBandPosition(1234 + SCAN_PERIOD_MS * 3), 9);
    expect(scanBandPosition(Number.NaN)).toBe(-1);
    expect(scanBandPosition(-500)).toBeCloseTo(scanBandPosition(SCAN_PERIOD_MS - 500), 9);
    expect(scanBandPosition(100, 0)).toBe(-1);
  });
});

describe("pulse01", () => {
  it("stays between 0 and 1 and repeats", () => {
    for (let t = 0; t < 5000; t += 137) {
      const p = pulse01(t, 2000, 0.3);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(p).toBeCloseTo(pulse01(t + 2000, 2000, 0.3), 9);
    }
    expect(pulse01(0, 2000)).toBeCloseTo(0, 9);
    expect(pulse01(1000, 2000)).toBeCloseTo(1, 9);
    expect(pulse01(5, 0)).toBe(0);
  });
});

describe("colours", () => {
  it("uses the approved cyan family and the approved ribbon fill", () => {
    expect(HOLO_CYAN).toBe("#5fc8e8");
    expect(HOLO_CYAN_BRIGHT).toBe("#67e8f9");
    expect(HOLO_RIBBON).toBe("#38bdf8");
    expect(HOLO_RIBBON_ALPHA).toBeCloseTo(0.22, 5);
  });
});
