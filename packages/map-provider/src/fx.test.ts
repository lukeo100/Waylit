import { describe, expect, it } from "vitest";
import {
  FX_OFF,
  FxGovernor,
  GOOGLE_FX_ON_BY_DEFAULT,
  cheaperLevel,
  fxLevelIsFromAddress,
  fxLevelIsPinned,
  parseFxLevel,
  fxParameters,
  gradePalette,
  resolveFxLevel,
} from "./fx";
import { lightingParameters } from "./lighting";
import type { SceneLighting } from "./types";

const base = { timestamp: 0, position: { lat: 52.47, lng: 13.4 }, sunAzimuthDegrees: 180 };
const DAY: SceneLighting = {
  ...base,
  sunElevationDegrees: 40,
  phase: "day",
  daylightFactor: 1,
  warmth: 0,
};
const SUNSET: SceneLighting = {
  ...base,
  sunElevationDegrees: -1,
  phase: "golden-hour",
  daylightFactor: 0.45,
  warmth: 1,
};
const NIGHT: SceneLighting = {
  ...base,
  sunElevationDegrees: -40,
  phase: "night",
  daylightFactor: 0,
  warmth: 0,
};

describe("fxParameters, holographic scan band and grid", () => {
  it("has no band or grid when off", () => {
    expect(FX_OFF.scanStrength).toBe(0);
    expect(FX_OFF.gridStrength).toBe(0);
  });

  it("shows the band in both levels and the grid in the full level only", () => {
    const high = fxParameters(NIGHT, "high");
    const low = fxParameters(NIGHT, "low");
    expect(high.scanStrength).toBeGreaterThan(0);
    expect(low.scanStrength).toBeGreaterThan(0);
    expect(high.gridStrength).toBeGreaterThan(0);
    expect(low.gridStrength).toBe(0);
    expect(low.scanStrength).toBeLessThan(high.scanStrength);
  });

  it("is quiet by day and clear at night", () => {
    const day = fxParameters(DAY, "high");
    const night = fxParameters(NIGHT, "high");
    expect(night.scanStrength).toBeGreaterThan(day.scanStrength * 2);
    expect(night.gridStrength).toBeGreaterThan(day.gridStrength * 2);
    expect(night.scanStrength).toBeLessThan(1);
  });
});

describe("fxParameters", () => {
  it("is exactly nothing when off", () => {
    expect(fxParameters(NIGHT, "off")).toBe(FX_OFF);
    expect(FX_OFF.gradeMix).toBe(0);
    expect(FX_OFF.edgeStrength).toBe(0);
    expect(FX_OFF.variant).toBe(0);
  });

  it("glows the edges most at night, least by day, with sunset in between", () => {
    const day = fxParameters(DAY, "high");
    const sunset = fxParameters(SUNSET, "high");
    const night = fxParameters(NIGHT, "high");
    expect(night.edgeStrength).toBeGreaterThan(sunset.edgeStrength);
    expect(sunset.edgeStrength).toBeGreaterThan(day.edgeStrength);
    // The night picture is dark, so its faint edges are boosted more.
    expect(night.edgeGain).toBeGreaterThan(day.edgeGain);
  });

  it("grades cooler and cleaner by day, warm magenta at sunset, deep blue at night", () => {
    const day = fxParameters(DAY, "high");
    const sunset = fxParameters(SUNSET, "high");
    const night = fxParameters(NIGHT, "high");
    // Day: navy darks, cool (blue above red) lights.
    expect(day.shadowTone[2]).toBeGreaterThan(day.shadowTone[0]);
    expect(day.highlightTone[2]).toBeGreaterThan(day.highlightTone[0]);
    // Sunset: the darks lean magenta (red above green).
    expect(sunset.shadowTone[0]).toBeGreaterThan(day.shadowTone[0]);
    expect(sunset.shadowTone[0]).toBeGreaterThan(sunset.shadowTone[1] * 2);
    // Night: stronger vignette and desaturation.
    expect(night.vignette).toBeGreaterThan(day.vignette);
    expect(night.saturation).toBeLessThan(day.saturation);
  });

  it("uses fewer taps and no scanline in the cheaper level", () => {
    const high = fxParameters(NIGHT, "high");
    const low = fxParameters(NIGHT, "low");
    expect(high.edgeTaps).toBe(8);
    expect(low.edgeTaps).toBe(2);
    expect(high.variant).toBe(2);
    expect(low.variant).toBe(1);
    expect(low.scanline).toBe(0);
    expect(high.scanline).toBeGreaterThan(0);
    expect(low.edgeStrength).toBeLessThan(high.edgeStrength);
  });

  it("keeps every value in range", () => {
    for (const lighting of [DAY, SUNSET, NIGHT]) {
      for (const level of ["low", "high"] as const) {
        const p = fxParameters(lighting, level);
        for (const value of [
          p.gradeMix,
          p.saturation,
          p.edgeStrength,
          p.hazeStrength,
          p.vignette,
        ]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        for (const channel of [...p.shadowTone, ...p.highlightTone, ...p.hazeColour]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1.1);
        }
        expect(p.contrast).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("changes its key only when the look changes", () => {
    const a = fxParameters({ ...DAY, daylightFactor: 1 }, "high");
    const b = fxParameters({ ...DAY, daylightFactor: 0.999 }, "high");
    expect(a.key).toBe(b.key);
    expect(fxParameters(NIGHT, "high").key).not.toBe(a.key);
    expect(fxParameters(DAY, "low").key).not.toBe(a.key);
  });
});

describe("levels and overrides", () => {
  it("steps down high, low, off", () => {
    expect(cheaperLevel("high")).toBe("low");
    expect(cheaperLevel("low")).toBe("off");
    expect(cheaperLevel("off")).toBeUndefined();
  });

  it("lets the address pick a level for any provider", () => {
    for (const provider of ["cesium-google", "maplibre-fallback"] as const) {
      expect(resolveFxLevel("?fx=off", provider)).toBe("off");
      expect(resolveFxLevel("?fx=low", provider)).toBe("low");
      expect(resolveFxLevel("?fx=HIGH", provider)).toBe("high");
    }
    expect(fxLevelIsPinned("?fx=low")).toBe(true);
    expect(fxLevelIsPinned("?fx=nonsense")).toBe(false);
    expect(fxLevelIsPinned("")).toBe(false);
  });

  it("starts the fallback at high and Google tiles off until the terms switch is turned on", () => {
    expect(resolveFxLevel("", "maplibre-fallback")).toBe("high");
    expect(GOOGLE_FX_ON_BY_DEFAULT).toBe(false);
    expect(resolveFxLevel("", "cesium-google")).toBe(GOOGLE_FX_ON_BY_DEFAULT ? "high" : "off");
  });
});

describe("FxGovernor", () => {
  function run(governor: FxGovernor, startMs: number, fps: number, seconds: number): number {
    let t = startMs;
    for (let i = 0; i < fps * seconds; i++) {
      t += 1000 / fps;
      governor.recordFrame(t);
      const change = governor.evaluate(t);
      if (change) return t;
    }
    return t;
  }

  it("keeps the level at a steady 30 fps", () => {
    const governor = new FxGovernor("high");
    run(governor, 0, 30, 60);
    expect(governor.level).toBe("high");
  });

  it("drops from high to low, then off, when the median falls below 30 fps", () => {
    const governor = new FxGovernor("high");
    let t = run(governor, 0, 20, 30);
    expect(governor.level).toBe("low");
    t = run(governor, t, 20, 30);
    expect(governor.level).toBe("off");
    // Off is the floor.
    run(governor, t, 10, 30);
    expect(governor.level).toBe("off");
  });

  it("needs enough frames and settling time before judging", () => {
    const governor = new FxGovernor("high");
    // 2 seconds of slow frames is not enough evidence.
    run(governor, 0, 20, 2);
    expect(governor.level).toBe("high");
  });

  it("never steps back up on its own", () => {
    const governor = new FxGovernor("high");
    let t = run(governor, 0, 20, 30);
    expect(governor.level).toBe("low");
    t = run(governor, t, 30, 60);
    expect(governor.level).toBe("low");
    governor.set("high");
    expect(governor.level).toBe("high");
    expect(t).toBeGreaterThan(0);
  });
});

describe("gradePalette", () => {
  const night = lightingParameters(NIGHT).palette;
  const day = lightingParameters(DAY).palette;

  it("changes nothing when off", () => {
    expect(gradePalette(day, DAY, "off")).toBe(day);
  });

  it("pulls the day palette toward cooler, less saturated colours", () => {
    const graded = gradePalette(day, DAY, "high");
    expect(graded.land).not.toBe(day.land);
    const blue = (hex: string): number => Number.parseInt(hex.slice(5, 7), 16);
    const red = (hex: string): number => Number.parseInt(hex.slice(1, 3), 16);
    expect(blue(graded.land) - red(graded.land)).toBeGreaterThanOrEqual(
      blue(day.land) - red(day.land),
    );
  });

  it("lifts roads toward cyan at night and not by day", () => {
    const gradedNight = gradePalette(night, NIGHT, "high");
    const gradedDay = gradePalette(day, DAY, "high");
    const channel = (hex: string, index: number): number =>
      Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
    // More blue and green than the plain night road, so it reads as a cyan line.
    expect(channel(gradedNight.roadMajor, 2)).toBeGreaterThan(channel(night.roadMajor, 2));
    expect(channel(gradedNight.roadMajor, 1)).toBeGreaterThan(channel(night.roadMajor, 1));
    // By day the road stays close to the plain palette.
    expect(Math.abs(channel(gradedDay.roadMajor, 1) - channel(day.roadMajor, 1))).toBeLessThan(45);
  });
});

describe("the saved effect level", () => {
  it("parses words and ignores anything else", () => {
    expect(parseFxLevel(" High ")).toBe("high");
    expect(parseFxLevel("off")).toBe("off");
    expect(parseFxLevel("max")).toBeUndefined();
    expect(parseFxLevel(null)).toBeUndefined();
  });

  it("comes after the address and before the default", () => {
    expect(resolveFxLevel("", "cesium-google", "high")).toBe("high");
    expect(resolveFxLevel("?fx=off", "cesium-google", "high")).toBe("off");
    expect(resolveFxLevel("", "cesium-google")).toBe("off");
    expect(resolveFxLevel("", "maplibre-fallback", "low")).toBe("low");
  });

  it("counts a saved level as chosen, and tells the address apart", () => {
    expect(fxLevelIsPinned("", "low")).toBe(true);
    expect(fxLevelIsPinned("")).toBe(false);
    expect(fxLevelIsFromAddress("?fx=low")).toBe(true);
    expect(fxLevelIsFromAddress("")).toBe(false);
  });
});
