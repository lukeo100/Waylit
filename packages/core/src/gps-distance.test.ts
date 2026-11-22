import { describe, expect, it } from "vitest";
import { GpsDistanceIntegrator } from "./gps-distance";
import { fromLocalMetres, haversineDistance } from "./geo";
import { createRng, gaussian } from "./random";
import type { PositionFix } from "./types";

const origin = { lat: 52.47, lng: 13.4 };
const fixAt = (
  east: number,
  north: number,
  extra: Partial<PositionFix["position"]> = {},
  speedMps?: number,
): PositionFix => ({
  position: { ...fromLocalMetres(origin, { east, north }), ...extra },
  ...(speedMps !== undefined ? { speedMps } : {}),
  timestamp: 0,
});

describe("GpsDistanceIntegrator", () => {
  it("adds up distance along a straight ride", () => {
    const gps = new GpsDistanceIntegrator();
    for (let i = 0; i <= 20; i++) gps.add(fixAt(i * 5, 0));
    expect(gps.distanceMetres).toBeCloseTo(100, 0);
  });

  it("does not count jitter while the fixes report standing still", () => {
    const gps = new GpsDistanceIntegrator();
    const random = createRng(7);
    for (let i = 0; i < 600; i++) {
      gps.add(fixAt(gaussian(random, 0, 0.8), gaussian(random, 0, 0.8), {}, 0.1));
    }
    expect(gps.distanceMetres).toBe(0);
  });

  it("copes with small jitter when no speed is reported", () => {
    const gps = new GpsDistanceIntegrator();
    const random = createRng(7);
    for (let i = 0; i < 600; i++) {
      gps.add(fixAt(gaussian(random, 0, 0.3), gaussian(random, 0, 0.3)));
    }
    expect(gps.distanceMetres).toBeLessThan(10);
  });

  it("counts a ride that reports a speed", () => {
    const gps = new GpsDistanceIntegrator();
    for (let i = 0; i <= 20; i++) gps.add(fixAt(i * 5, 0, {}, 5));
    expect(gps.distanceMetres).toBeCloseTo(100, 0);
  });

  it("does not lose distance on a slow ride", () => {
    const gps = new GpsDistanceIntegrator();
    for (let i = 0; i <= 100; i++) gps.add(fixAt(i * 0.5, 0));
    expect(gps.distanceMetres).toBeGreaterThan(45);
    expect(gps.distanceMetres).toBeLessThanOrEqual(50.1);
  });

  it("ignores fixes with poor accuracy", () => {
    const gps = new GpsDistanceIntegrator();
    gps.add(fixAt(0, 0));
    gps.add(fixAt(500, 0, { accuracy: 200 }));
    gps.add(fixAt(10, 0, { accuracy: 5 }));
    expect(gps.distanceMetres).toBeCloseTo(10, 0);
  });

  it("measures with the same earth model as the rest of the app", () => {
    const gps = new GpsDistanceIntegrator();
    const a = fixAt(0, 0);
    const b = fixAt(0, 40);
    gps.add(a);
    gps.add(b);
    expect(gps.distanceMetres).toBeCloseTo(haversineDistance(a.position, b.position), 6);
  });

  it("starts again from zero after a reset", () => {
    const gps = new GpsDistanceIntegrator();
    gps.add(fixAt(0, 0));
    gps.add(fixAt(50, 0));
    gps.reset();
    expect(gps.distanceMetres).toBe(0);
    gps.add(fixAt(200, 0));
    expect(gps.distanceMetres).toBe(0);
  });
});
