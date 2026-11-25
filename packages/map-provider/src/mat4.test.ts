import { describe, expect, it } from "vitest";
import { identity, modelMatrix, multiply, transformPoint } from "./mat4";

describe("modelMatrix", () => {
  const origin: [number, number, number] = [10, 20, 3];

  it("moves the origin and keeps forward as north at heading 0", () => {
    const m = modelMatrix(identity(), origin, 0, 1, 1, 1, 1);
    expect(transformPoint(m, [0, 0, 0])).toEqual([10, 20, 3]);
    const forward = transformPoint(m, [0, 1, 0]);
    expect(forward[0]).toBeCloseTo(10, 9);
    expect(forward[1]).toBeCloseTo(21, 9);
  });

  it("points forward east at heading 90 and south at 180", () => {
    const east = transformPoint(modelMatrix(identity(), origin, 90, 1, 1, 1, 1), [0, 1, 0]);
    expect(east[0]).toBeCloseTo(11, 9);
    expect(east[1]).toBeCloseTo(20, 9);
    const south = transformPoint(modelMatrix(identity(), origin, 180, 1, 1, 1, 1), [0, 1, 0]);
    expect(south[0]).toBeCloseTo(10, 9);
    expect(south[1]).toBeCloseTo(19, 9);
  });

  it("puts the rider's right hand on the east side when heading north", () => {
    const right = transformPoint(modelMatrix(identity(), origin, 0, 1, 1, 1, 1), [1, 0, 0]);
    expect(right[0]).toBeCloseTo(11, 9);
  });

  it("applies scale and per axis metres, including a flipped y for web mercator", () => {
    const m = modelMatrix(identity(), [0, 0, 0], 0, 2, 0.5, -0.5, 0.25);
    const p = transformPoint(m, [1, 1, 1]);
    expect(p[0]).toBeCloseTo(1, 9);
    expect(p[1]).toBeCloseTo(-1, 9);
    expect(p[2]).toBeCloseTo(0.5, 9);
  });
});

describe("multiply", () => {
  it("applies the right hand matrix first", () => {
    const move = modelMatrix(identity(), [5, 0, 0], 0, 1, 1, 1, 1);
    const scale = modelMatrix(identity(), [0, 0, 0], 0, 2, 1, 1, 1);
    const both = multiply(identity(), move, scale);
    expect(transformPoint(both, [1, 0, 0])).toEqual([7, 0, 0]);
  });

  it("leaves a point alone when multiplied by identity", () => {
    const m = modelMatrix(identity(), [1, 2, 3], 33, 1.5, 1, 1, 1);
    const out = multiply(identity(), identity(), m);
    expect(Array.from(out)).toEqual(Array.from(m));
  });
});
