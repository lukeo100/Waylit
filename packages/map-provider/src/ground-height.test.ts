import { describe, expect, it } from "vitest";
import {
  BERLIN_GEOID_UNDULATION_METRES,
  DEMO_ROUTE_GROUND_ELLIPSOID_METRES,
  DEMO_ROUTE_GROUND_MSL_METRES,
  constantGroundHeight,
} from "./ground-height";

describe("ground height", () => {
  it("adds the geoid undulation at Berlin (about 40 m) to the height above sea level", () => {
    expect(BERLIN_GEOID_UNDULATION_METRES).toBe(40);
    expect(DEMO_ROUTE_GROUND_ELLIPSOID_METRES).toBe(
      DEMO_ROUTE_GROUND_MSL_METRES + BERLIN_GEOID_UNDULATION_METRES,
    );
    expect(DEMO_ROUTE_GROUND_ELLIPSOID_METRES).toBe(90);
  });

  it("is a plain constant that takes no input from the scene", () => {
    const source = constantGroundHeight(90);
    expect(source.heightAt({ lat: 52.47, lng: 13.4 })).toBe(90);
    expect(source.heightAt({ lat: 0, lng: 0 })).toBe(90);
  });
});
