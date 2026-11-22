import { describe, expect, it } from "vitest";
import { createRng, gaussian } from "./random";
import { AlphaBetaFilter, AngleLowPassFilter, LowPassFilter, PositionSmoother } from "./smoothing";
import { haversineDistance, fromLocalMetres, toLocalMetres } from "./geo";

describe("LowPassFilter", () => {
  it("returns the first sample unchanged", () => {
    expect(new LowPassFilter(1).update(10, 1)).toBe(10);
  });

  it("closes about 63 percent of a step after one time constant", () => {
    const f = new LowPassFilter(2);
    f.update(0, 0);
    expect(f.update(100, 2)).toBeCloseTo(63.21, 1);
  });

  it("gives the same answer for one big step or many small ones", () => {
    const a = new LowPassFilter(1);
    const b = new LowPassFilter(1);
    a.update(0, 0);
    b.update(0, 0);
    a.update(10, 1);
    for (let i = 0; i < 10; i++) b.update(10, 0.1);
    expect(b.value).toBeCloseTo(a.value as number, 9);
  });

  it("passes samples straight through with a zero time constant", () => {
    const f = new LowPassFilter(0);
    f.update(1, 1);
    expect(f.update(7, 1)).toBe(7);
  });

  it("forgets its state on reset", () => {
    const f = new LowPassFilter(1);
    f.update(5, 1);
    f.reset();
    expect(f.value).toBeUndefined();
  });
});

describe("AngleLowPassFilter", () => {
  it("turns the short way across north", () => {
    const f = new AngleLowPassFilter(1);
    f.update(350, 0);
    const result = f.update(10, 1);
    // Halfway-ish across the 20 degree gap, through 0, never through 180.
    expect(result > 350 || result < 10).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(360);
  });

  it("settles on a constant heading", () => {
    const f = new AngleLowPassFilter(0.5);
    f.update(90, 0);
    for (let i = 0; i < 40; i++) f.update(180, 0.25);
    expect(f.value).toBeCloseTo(180, 3);
  });
});

describe("AlphaBetaFilter", () => {
  it("tracks a steady ramp with no lag once it has settled", () => {
    const f = new AlphaBetaFilter(0.5, 0.2);
    let last = 0;
    for (let t = 0; t < 60; t++) last = f.update(5 * t, 1);
    expect(Math.abs(last - 5 * 59)).toBeLessThan(0.01);
    expect(f.velocityEstimate).toBeCloseTo(5, 1);
  });
});

describe("PositionSmoother", () => {
  it("reduces noise on a straight run compared with the raw fixes", () => {
    const origin = { lat: 52.47, lng: 13.4 };
    const random = createRng(42);
    const smoother = new PositionSmoother();
    let rawError = 0;
    let smoothError = 0;
    let count = 0;
    for (let t = 0; t < 120; t++) {
      const truth = fromLocalMetres(origin, { east: 5 * t, north: 0 });
      const raw = fromLocalMetres(origin, {
        east: 5 * t + gaussian(random, 0, 3),
        north: gaussian(random, 0, 3),
      });
      const smooth = smoother.update(raw, 1);
      if (t >= 20) {
        rawError += haversineDistance(truth, raw) ** 2;
        smoothError += haversineDistance(truth, smooth) ** 2;
        count++;
      }
    }
    expect(Math.sqrt(smoothError / count)).toBeLessThan(Math.sqrt(rawError / count) * 0.8);
  });

  it("round-trips local metres", () => {
    const o = { lat: 52.47, lng: 13.4 };
    const p = fromLocalMetres(o, { east: 120, north: -80 });
    const back = toLocalMetres(o, p);
    expect(back.east).toBeCloseTo(120, 6);
    expect(back.north).toBeCloseTo(-80, 6);
  });
});
