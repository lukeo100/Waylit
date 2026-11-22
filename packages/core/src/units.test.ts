import { describe, expect, it } from "vitest";
import { kmhToMps, metresToKilometres, metresToMiles, mphToMps, mpsToKmh, mpsToMph } from "./units";

describe("speed conversions", () => {
  it("converts metres per second to km/h and back", () => {
    expect(mpsToKmh(10)).toBeCloseTo(36, 10);
    expect(kmhToMps(25)).toBeCloseTo(6.944444, 5);
    expect(kmhToMps(mpsToKmh(7.3))).toBeCloseTo(7.3, 10);
  });

  it("converts metres per second to mph and back", () => {
    expect(mpsToMph(mphToMps(15))).toBeCloseTo(15, 10);
    expect(mphToMps(1)).toBeCloseTo(0.44704, 10);
  });

  it("keeps zero as zero", () => {
    expect(mpsToKmh(0)).toBe(0);
    expect(mpsToMph(0)).toBe(0);
  });
});

describe("distance conversions", () => {
  it("converts metres to kilometres and miles", () => {
    expect(metresToKilometres(2500)).toBe(2.5);
    expect(metresToMiles(1609.344)).toBeCloseTo(1, 10);
  });
});
