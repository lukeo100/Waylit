import { describe, expect, it } from "vitest";
import { fromLocalMetres, toLocalMetres } from "@waylit/core";
import { groundGrid } from "./ground-grid";

const reference = { lat: 52.47, lng: 13.4 };

describe("groundGrid", () => {
  it("lays lines on multiples of the spacing from the reference point", () => {
    const grid = groundGrid(reference, fromLocalMetres(reference, { east: 37, north: -21 }), {
      spacingMetres: 16,
      reachMetres: 64,
    });
    expect(grid.lines.length).toBe(2 * (2 * 4 + 1));
    for (const [a, b] of grid.lines) {
      const pa = toLocalMetres(reference, a);
      const pb = toLocalMetres(reference, b);
      const vertical = Math.abs(pa.east - pb.east) < 1e-3;
      const fixed = vertical ? pa.east : pa.north;
      expect(Math.abs(fixed / 16 - Math.round(fixed / 16))).toBeLessThan(1e-4);
    }
  });

  it("keeps the same key and lines while the rider stays in a cell", () => {
    const a = groundGrid(reference, fromLocalMetres(reference, { east: 33, north: 5 }));
    const b = groundGrid(reference, fromLocalMetres(reference, { east: 35, north: 6 }));
    expect(a.key).toBe(b.key);
  });

  it("changes the key when the rider crosses into the next cell", () => {
    const a = groundGrid(reference, fromLocalMetres(reference, { east: 7, north: 0 }));
    const b = groundGrid(reference, fromLocalMetres(reference, { east: 9, north: 0 }));
    expect(a.key).not.toBe(b.key);
  });

  it("covers the rider", () => {
    const rider = fromLocalMetres(reference, { east: 200, north: 300 });
    const grid = groundGrid(reference, rider, { spacingMetres: 16, reachMetres: 128 });
    const eastValues = grid.lines.map(([a]) => toLocalMetres(reference, a).east);
    expect(Math.min(...eastValues)).toBeLessThan(200);
    expect(Math.max(...eastValues)).toBeGreaterThan(200);
  });
});
