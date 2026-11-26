import { describe, expect, it } from "vitest";
import {
  DEFAULT_TUNING,
  effectivePixelRatio,
  parseMapChoice,
  resolveTuning,
  selectProvider,
} from "./options";

describe("parseMapChoice", () => {
  it("reads the two known values, ignoring case and spaces", () => {
    expect(parseMapChoice("?map=cesium")).toBe("cesium");
    expect(parseMapChoice("?map=fallback")).toBe("fallback");
    expect(parseMapChoice("?dev=1&map=CESIUM")).toBe("cesium");
    expect(parseMapChoice("?map=%20fallback%20")).toBe("fallback");
  });

  it("ignores anything else", () => {
    expect(parseMapChoice("")).toBeUndefined();
    expect(parseMapChoice("?map=google")).toBeUndefined();
    expect(parseMapChoice("?map=")).toBeUndefined();
  });
});

describe("selectProvider", () => {
  const token = "token-for-tests";

  it("uses the fallback when there is no token, in any build", () => {
    expect(selectProvider({ search: "", token: undefined, nodeEnv: "production" })).toEqual({
      id: "maplibre-fallback",
      reason: "no-token",
    });
    expect(selectProvider({ search: "", token: "", nodeEnv: "production" }).id).toBe(
      "maplibre-fallback",
    );
    expect(selectProvider({ search: "", token: "   ", nodeEnv: "production" }).id).toBe(
      "maplibre-fallback",
    );
  });

  it("uses Cesium in production when a token is set", () => {
    expect(selectProvider({ search: "", token, nodeEnv: "production" })).toEqual({
      id: "cesium-google",
      reason: "token",
    });
  });

  it("defaults to the fallback in development so hot reloads do not use the allowance", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      expect(selectProvider({ search: "", token, nodeEnv })).toEqual({
        id: "maplibre-fallback",
        reason: "development-default",
      });
    }
  });

  it("lets ?map=cesium turn Cesium on in development, when there is a token", () => {
    expect(selectProvider({ search: "?map=cesium", token, nodeEnv: "development" })).toEqual({
      id: "cesium-google",
      reason: "override-cesium",
    });
  });

  it("never picks Cesium without a token, even when asked", () => {
    expect(
      selectProvider({ search: "?map=cesium", token: undefined, nodeEnv: "production" }),
    ).toEqual({
      id: "maplibre-fallback",
      reason: "override-cesium-no-token",
    });
  });

  it("lets ?map=fallback force the fallback even with a token", () => {
    expect(selectProvider({ search: "?map=fallback", token, nodeEnv: "production" })).toEqual({
      id: "maplibre-fallback",
      reason: "override-fallback",
    });
  });
});

describe("resolveTuning", () => {
  it("returns the defaults when overrides are not allowed", () => {
    expect(resolveTuning("cesium-google", "?sse=99&dpr=3&fps=60&ground=500", false)).toEqual(
      DEFAULT_TUNING["cesium-google"],
    );
  });

  it("takes the effect level from the address in every build, and pins it", () => {
    const tuned = resolveTuning("cesium-google", "?fx=low", false);
    expect(tuned.fxLevel).toBe("low");
    expect(tuned.fxPinned).toBe(true);
    expect(resolveTuning("maplibre-fallback", "", false).fxPinned).toBe(false);
    expect(resolveTuning("maplibre-fallback", "?fx=off", false).fxLevel).toBe("off");
  });

  it("applies and clamps overrides when allowed", () => {
    const tuning = resolveTuning("cesium-google", "?sse=1000&dpr=0.1&fps=24&ground=120", true);
    expect(tuning.maximumScreenSpaceError).toBe(128);
    expect(tuning.pixelRatioCap).toBe(0.5);
    expect(tuning.ridingFps).toBe(24);
    expect(tuning.groundHeightEllipsoidMetres).toBe(120);
  });

  it("ignores values that are not numbers", () => {
    const tuning = resolveTuning("cesium-google", "?sse=abc&dpr=&fps=NaN", true);
    expect(tuning.maximumScreenSpaceError).toBe(
      DEFAULT_TUNING["cesium-google"].maximumScreenSpaceError,
    );
    expect(tuning.pixelRatioCap).toBe(DEFAULT_TUNING["cesium-google"].pixelRatioCap);
    expect(tuning.ridingFps).toBe(30);
  });

  it("switches terrain and the debug marker from the address", () => {
    expect(resolveTuning("maplibre-fallback", "?terrain=0", true).terrain).toBe(false);
    expect(resolveTuning("maplibre-fallback", "", true).terrain).toBe(true);
    expect(resolveTuning("maplibre-fallback", "?marker=1", true).debugMarker).toBe(true);
    expect(resolveTuning("maplibre-fallback", "", true).debugMarker).toBe(false);
  });

  it("keeps the shipped defaults inside a sensible range for a mid range phone", () => {
    const cesium = DEFAULT_TUNING["cesium-google"];
    expect(cesium.pixelRatioCap).toBeLessThanOrEqual(2);
    expect(cesium.ridingFps).toBeLessThanOrEqual(30);
    expect(cesium.maximumScreenSpaceError).toBeGreaterThanOrEqual(24);
    // Far below the 1.5 GiB the Cesium helper asks for by default.
    expect(cesium.cacheBytes + cesium.maximumCacheOverflowBytes).toBeLessThanOrEqual(
      512 * 1024 * 1024,
    );
    expect(DEFAULT_TUNING["maplibre-fallback"].pixelRatioCap).toBeLessThanOrEqual(2);
  });
});

describe("effectivePixelRatio", () => {
  it("caps a high density phone screen", () => {
    expect(effectivePixelRatio(2.625, 1.5)).toBe(1.5);
    expect(effectivePixelRatio(3.5, 2)).toBe(2);
  });

  it("never raises a low density screen", () => {
    expect(effectivePixelRatio(1, 1.5)).toBe(1);
  });

  it("copes with a missing or silly value", () => {
    expect(effectivePixelRatio(Number.NaN, 1.5)).toBe(1);
    expect(effectivePixelRatio(0, 1.5)).toBe(1);
    expect(effectivePixelRatio(2, 0.1)).toBe(0.5);
  });
});

describe("the rider's saved choice", () => {
  const token = "token-for-tests";

  it("picks Google tiles when chosen, even in development, and the fallback when chosen", () => {
    expect(
      selectProvider({ search: "", token, nodeEnv: "development", preference: "cesium" }),
    ).toEqual({ id: "cesium-google", reason: "chosen-cesium" });
    expect(
      selectProvider({ search: "", token, nodeEnv: "production", preference: "fallback" }),
    ).toEqual({ id: "maplibre-fallback", reason: "chosen-fallback" });
  });

  it("is beaten by the address in both directions", () => {
    expect(
      selectProvider({
        search: "?map=fallback",
        token,
        nodeEnv: "production",
        preference: "cesium",
      }),
    ).toEqual({ id: "maplibre-fallback", reason: "override-fallback" });
    expect(
      selectProvider({
        search: "?map=cesium",
        token,
        nodeEnv: "development",
        preference: "fallback",
      }),
    ).toEqual({ id: "cesium-google", reason: "override-cesium" });
  });

  it("never picks Google tiles without a token", () => {
    expect(
      selectProvider({ search: "", token: undefined, nodeEnv: "production", preference: "cesium" }),
    ).toEqual({ id: "maplibre-fallback", reason: "no-token" });
  });

  it("keeps the development default of the fallback when nothing was chosen", () => {
    expect(selectProvider({ search: "", token, nodeEnv: "development" }).reason).toBe(
      "development-default",
    );
    expect(
      selectProvider({ search: "", token, nodeEnv: "development", preference: undefined }).id,
    ).toBe("maplibre-fallback");
  });

  it("feeds the saved effect level into the tuning, and the address still wins", () => {
    // A saved level is where it starts. Only the address pins it, so the governor can lower it.
    expect(resolveTuning("cesium-google", "", false, "low")).toMatchObject({
      fxLevel: "low",
      fxPinned: false,
    });
    expect(resolveTuning("cesium-google", "?fx=high", false, "low")).toMatchObject({
      fxLevel: "high",
      fxPinned: true,
    });
    expect(resolveTuning("cesium-google", "", false)).toMatchObject({
      fxLevel: "off",
      fxPinned: false,
    });
  });
});
