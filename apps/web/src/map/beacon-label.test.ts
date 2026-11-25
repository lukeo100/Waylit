import { describe, expect, it } from "vitest";
import { LABEL_BOUNDS, clampLabel } from "./beacon-label";

describe("clampLabel", () => {
  it("leaves a point in the readable middle alone", () => {
    expect(clampLabel({ x: 400, y: 150 }, 800, 400)).toEqual({ x: 400, y: 150 });
  });

  it("keeps the label off the edges and out of the dock and the top strip", () => {
    const top = clampLabel({ x: -50, y: -20 }, 800, 400)!;
    expect(top.x).toBeCloseTo(80, 6);
    expect(top.y).toBeCloseTo(112, 6);
    const bottom = clampLabel({ x: 5000, y: 900 }, 800, 400)!;
    expect(bottom.x).toBeCloseTo(720, 6);
    expect(bottom.y).toBeCloseTo(248, 6);
  });

  it("never lets the label rise above 28 percent of the scene, so it stays below the top HUD", () => {
    expect(LABEL_BOUNDS.minY).toBe(0.28);
    for (const height of [360, 412, 720, 1080]) {
      const lifted = clampLabel({ x: 300, y: height * 0.2 }, 800, height)!;
      expect(lifted.y).toBeCloseTo(height * 0.28, 6);
      expect(clampLabel({ x: 300, y: height * 0.28 }, 800, height)!.y).toBeCloseTo(
        height * 0.28,
        6,
      );
    }
  });

  it("drops a label with no usable position or size", () => {
    expect(clampLabel({ x: Number.NaN, y: 10 }, 800, 400)).toBeUndefined();
    expect(clampLabel({ x: 10, y: Number.POSITIVE_INFINITY }, 800, 400)).toBeUndefined();
    expect(clampLabel({ x: 10, y: 10 }, 0, 400)).toBeUndefined();
  });
});
