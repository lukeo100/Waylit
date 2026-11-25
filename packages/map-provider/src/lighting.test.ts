import { describe, expect, it } from "vitest";
import { hexToRgb, lightingParameters, mixHex, rgbToHex, sunDirection } from "./lighting";
import type { SceneLighting } from "./types";

const POSITION = { lat: 52.4709, lng: 13.3995 };

function lighting(overrides: Partial<SceneLighting>): SceneLighting {
  return {
    timestamp: 0,
    position: POSITION,
    sunElevationDegrees: 40,
    sunAzimuthDegrees: 180,
    phase: "day",
    daylightFactor: 1,
    warmth: 0,
    ...overrides,
  };
}

const DAY = lighting({});
const SUNSET = lighting({
  sunElevationDegrees: -0.8,
  sunAzimuthDegrees: 235,
  phase: "golden-hour",
  daylightFactor: 0.43,
  warmth: 0.97,
});
const NIGHT = lighting({
  sunElevationDegrees: -40,
  sunAzimuthDegrees: 0,
  phase: "night",
  daylightFactor: 0,
  warmth: 0,
});

const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe("colour helpers", () => {
  it("round trips hex colours", () => {
    expect(rgbToHex(hexToRgb("#5fc8e8"))).toBe("#5fc8e8");
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb("nonsense")).toEqual([0, 0, 0]);
  });

  it("mixes between two colours and clamps", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#000000", "#ffffff", 7)).toBe("#ffffff");
  });
});

describe("sunDirection", () => {
  it("points up for a sun overhead and along the compass for one on the horizon", () => {
    expect(sunDirection(0, 90).up).toBeCloseTo(1, 9);
    const east = sunDirection(90, 0);
    expect(east.east).toBeCloseTo(1, 9);
    expect(east.north).toBeCloseTo(0, 9);
    const south = sunDirection(180, 0);
    expect(south.north).toBeCloseTo(-1, 9);
  });

  it("is a unit vector", () => {
    const d = sunDirection(235, 20);
    expect(Math.hypot(d.east, d.north, d.up)).toBeCloseTo(1, 9);
  });
});

describe("lightingParameters", () => {
  const day = lightingParameters(DAY);
  const sunset = lightingParameters(SUNSET);
  const night = lightingParameters(NIGHT);

  it("takes the sun direction from the solar state", () => {
    expect(day.sunDirection.up).toBeGreaterThan(0.6);
    expect(day.sunDirection.north).toBeLessThan(0);
    expect(sunset.sunDirection.up).toBeCloseTo(Math.sin((-0.8 * Math.PI) / 180), 6);
    expect(night.sunDirection.up).toBeLessThan(-0.5);
  });

  it("is brightest by day, between at sunset and darkest at night", () => {
    expect(day.directIntensity).toBeGreaterThan(sunset.directIntensity);
    expect(sunset.directIntensity).toBeGreaterThanOrEqual(night.directIntensity);
    expect(night.directIntensity).toBe(0);
    expect(day.directIntensity).toBe(1);
    expect(day.ambientIntensity).toBeGreaterThan(sunset.ambientIntensity);
    expect(sunset.ambientIntensity).toBeGreaterThan(night.ambientIntensity);
    // Dark, not black.
    expect(night.ambientIntensity).toBeGreaterThan(0.05);
  });

  it("leaves the photographic tiles untouched by day and dark and blue at night", () => {
    expect(day.tint).toEqual([1, 1, 1]);
    const [r, g, b] = night.tint;
    expect(Math.max(r, g, b)).toBeLessThan(0.25);
    expect(b).toBeGreaterThan(r);
  });

  it("warms the tint at sunset", () => {
    const [r, , b] = sunset.tint;
    expect(r).toBeGreaterThan(b);
    expect(r).toBeLessThan(1.1 + 1e-9);
  });

  it("makes a dark and quiet night sky and a bright day sky", () => {
    expect(luminance(night.sky.zenith)).toBeLessThan(0.05);
    expect(luminance(night.sky.horizon)).toBeLessThan(0.1);
    expect(luminance(day.sky.horizon)).toBeGreaterThan(0.6);
    expect(night.isNight).toBe(true);
    expect(day.isNight).toBe(false);
    expect(sunset.isNight).toBe(false);
  });

  it("puts orange on the horizon at sunset", () => {
    const [r, , b] = hexToRgb(sunset.sky.horizon);
    expect(r).toBeGreaterThan(b);
    expect(luminance(sunset.sky.horizon)).toBeGreaterThan(luminance(night.sky.horizon));
  });

  it("darkens the map palette at night", () => {
    expect(luminance(night.palette.land)).toBeLessThan(0.08);
    expect(luminance(day.palette.land)).toBeGreaterThan(0.7);
    expect(luminance(night.palette.building)).toBeLessThan(luminance(day.palette.building));
    // The roads still show against the land at night.
    expect(luminance(night.palette.roadMajor)).toBeGreaterThan(luminance(night.palette.land));
  });

  it("aims the map light at the sun's compass bearing", () => {
    expect(day.lightPosition[1]).toBe(180);
    expect(sunset.lightPosition[1]).toBe(235);
    for (const params of [day, sunset, night]) {
      expect(params.lightPosition[2]).toBeGreaterThanOrEqual(8);
      expect(params.lightPosition[2]).toBeLessThanOrEqual(80);
    }
  });

  it("changes its key only when something visible changes", () => {
    const nearby = lightingParameters(
      lighting({ daylightFactor: 0.999, sunElevationDegrees: 40.2 }),
    );
    expect(nearby.key).toBe(day.key);
    expect(sunset.key).not.toBe(day.key);
    expect(night.key).not.toBe(day.key);
  });

  it("clamps out of range input", () => {
    const params = lightingParameters(lighting({ daylightFactor: 3, warmth: -1 }));
    expect(params.tint).toEqual([1, 1, 1]);
  });
});
