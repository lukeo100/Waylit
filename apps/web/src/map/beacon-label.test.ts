import { describe, expect, it } from "vitest";
import { clampLabel } from "./beacon-label";

describe("clampLabel", () => {
  it("leaves a point in the readable middle alone", () => {
    expect(clampLabel({ x: 400, y: 150 }, 800, 400)).toEqual({ x: 400, y: 150 });
  });

  it("keeps the label off the edges and out of the dock and the top strip", () => {
    const top = clampLabel({ x: -50, y: -20 }, 800, 400)!;
    expect(top.x).toBeCloseTo(80, 6);
    expect(top.y).toBeCloseTo(64, 6);
    const bottom = clampLabel({ x: 5000, y: 900 }, 800, 400)!;
    expect(bottom.x).toBeCloseTo(720, 6);
    expect(bottom.y).toBeCloseTo(248, 6);
  });

  it("drops a label with no usable position or size", () => {
    expect(clampLabel({ x: Number.NaN, y: 10 }, 800, 400)).toBeUndefined();
    expect(clampLabel({ x: 10, y: Number.POSITIVE_INFINITY }, 800, 400)).toBeUndefined();
    expect(clampLabel({ x: 10, y: 10 }, 0, 400)).toBeUndefined();
  });
});
