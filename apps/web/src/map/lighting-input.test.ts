import { describe, expect, it } from "vitest";
import { lightingParameters } from "@waylit/map-provider";
import { computeDaylight, presetInstant } from "@/hud/daylight";
import { sceneLightingFrom } from "./lighting-input";

const BERLIN = { lat: 52.4709, lng: 13.3995 };
const DAY_MS = Date.UTC(2026, 10, 25, 12, 0, 0);

describe("sceneLightingFrom", () => {
  it("passes the sun state and the daylight factor through unchanged", () => {
    const daylight = computeDaylight(BERLIN, DAY_MS);
    const lighting = sceneLightingFrom(daylight);
    expect(lighting.timestamp).toBe(DAY_MS);
    expect(lighting.sunElevationDegrees).toBe(daylight.solar.elevationDegrees);
    expect(lighting.sunAzimuthDegrees).toBe(daylight.solar.azimuthDegrees);
    expect(lighting.phase).toBe(daylight.solar.phase);
    expect(lighting.daylightFactor).toBe(daylight.factor);
    expect(lighting.warmth).toBe(daylight.warmth);
    expect(lighting.position).toEqual(BERLIN);
  });

  it("shows day, sunset and night from the dev time override presets", () => {
    const at = (preset: "noon" | "sunset" | "night") =>
      lightingParameters(
        sceneLightingFrom(computeDaylight(BERLIN, presetInstant(preset, BERLIN, DAY_MS), true)),
      );
    const noon = at("noon");
    const sunset = at("sunset");
    const night = at("night");

    expect(noon.isNight).toBe(false);
    expect(noon.directIntensity).toBeGreaterThan(0);
    expect(night.isNight).toBe(true);
    expect(night.directIntensity).toBe(0);
    // Sunset is warm: more red than blue in the tint and on the horizon.
    expect(sunset.tint[0]).toBeGreaterThan(sunset.tint[2]);
    // The three moments each have their own lighting.
    expect(new Set([noon.key, sunset.key, night.key]).size).toBe(3);
    // Brightness falls from day to sunset to night.
    const sum = (t: readonly number[]) => t.reduce((a, b) => a + b, 0);
    expect(sum(noon.tint)).toBeGreaterThan(sum(sunset.tint));
    expect(sum(sunset.tint)).toBeGreaterThan(sum(night.tint));
  });
});
