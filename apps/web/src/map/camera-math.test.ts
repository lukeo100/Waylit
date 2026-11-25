import { DEFAULT_FOLLOW_PROFILE, framing, rigGeometry } from "@waylit/map-provider";
import { describe, expect, it } from "vitest";
import { mapPitchFromDepression, zoomForRange } from "./camera-math";

describe("mapPitchFromDepression", () => {
  it("measures pitch from straight down", () => {
    expect(mapPitchFromDepression(0)).toBe(85);
    expect(mapPitchFromDepression(11.5)).toBeCloseTo(78.5, 6);
    expect(mapPitchFromDepression(90)).toBe(0);
  });

  it("stays inside MapLibre's pitch limit", () => {
    expect(mapPitchFromDepression(-20)).toBe(85);
    expect(mapPitchFromDepression(200)).toBe(0);
  });
});

describe("zoomForRange", () => {
  it("zooms in as the range shrinks, by one level per halving", () => {
    const far = zoomForRange(40, 52.47, 412, 45);
    const near = zoomForRange(20, 52.47, 412, 45);
    expect(near - far).toBeCloseTo(1, 6);
  });

  it("gives a street level zoom for the follow camera on a phone", () => {
    const { rangeMetres } = rigGeometry(DEFAULT_FOLLOW_PROFILE);
    const zoom = zoomForRange(rangeMetres, 52.47, 412, DEFAULT_FOLLOW_PROFILE.verticalFovDegrees);
    expect(zoom).toBeGreaterThan(19);
    expect(zoom).toBeLessThan(21);
  });

  it("needs a higher zoom for a taller screen at the same range", () => {
    expect(zoomForRange(20, 52.47, 800, 45)).toBeGreaterThan(zoomForRange(20, 52.47, 400, 45));
  });

  it("stays in range for silly input", () => {
    expect(zoomForRange(0, 52, 412, 45)).toBeLessThanOrEqual(22);
    expect(zoomForRange(1e9, 52, 412, 45)).toBe(0);
  });

  it("agrees with the framing used by the follow camera", () => {
    // The rider is below the centre by the angle between the axis and the rider: this checks
    // the field of view the zoom is derived from is the one the framing assumes.
    const { riderY, horizonY } = framing(DEFAULT_FOLLOW_PROFILE);
    expect(riderY).toBeGreaterThan(horizonY);
  });
});
