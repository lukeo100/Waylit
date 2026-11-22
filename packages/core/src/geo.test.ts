import { describe, expect, it } from "vitest";
import { haversineDistance } from "./geo";

describe("haversineDistance", () => {
  it("is zero for the same point", () => {
    const p = { lat: 10, lng: 20 };
    expect(haversineDistance(p, p)).toBe(0);
  });

  it("matches one degree of latitude at the equator", () => {
    // One degree of arc on the mean-radius sphere is about 111.195 km.
    const d = haversineDistance({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(111_190);
    expect(d).toBeLessThan(111_200);
  });

  it("is symmetric", () => {
    const a = { lat: 51.5, lng: -0.12 };
    const b = { lat: 48.85, lng: 2.35 };
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 6);
  });

  it("handles antipodal points without NaN", () => {
    const d = haversineDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(d).toBeCloseTo(Math.PI * 6_371_008.8, 0);
  });
});
