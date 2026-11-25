import { describe, expect, it } from "vitest";
import {
  BEACON_HEIGHT_METRES,
  buildBeaconMesh,
  buildChevronMesh,
  buildHeadingMesh,
  buildRiderMesh,
  meshFor,
  type HoloMesh,
} from "./holo-model";

const meshes: [string, HoloMesh][] = [
  ["rider", buildRiderMesh()],
  ["chevron", buildChevronMesh()],
  ["beacon", buildBeaconMesh()],
  ["heading", buildHeadingMesh()],
];

describe.each(meshes)("%s mesh", (_name, mesh) => {
  it("has consistent, finite arrays that fit 16 bit indices", () => {
    const vertices = mesh.positions.length / 3;
    expect(vertices).toBeGreaterThan(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.params.length).toBe(vertices * 2);
    expect(mesh.indices.length % 3).toBe(0);
    expect(vertices).toBeLessThan(65536);
    for (const array of [mesh.positions, mesh.normals, mesh.params]) {
      for (const value of array) expect(Number.isFinite(value)).toBe(true);
    }
    for (const index of mesh.indices) expect(index).toBeLessThan(vertices);
  });

  it("has unit normals", () => {
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const length = Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
      expect(length).toBeCloseTo(1, 4);
    }
  });

  it("reports bounds that match its positions", () => {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        expect(mesh.positions[i + k]!).toBeGreaterThanOrEqual(mesh.min[k]! - 1e-6);
        expect(mesh.positions[i + k]!).toBeLessThanOrEqual(mesh.max[k]! + 1e-6);
      }
    }
  });

  it("stores the height of each vertex in its parameters", () => {
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      expect(mesh.params[v * 2]!).toBeCloseTo(mesh.positions[v * 3 + 2]!, 6);
    }
  });
});

describe("rider mesh", () => {
  const { min, max } = buildRiderMesh();

  it("is the size of a standing rider on a large kick scooter", () => {
    expect(min[2]).toBeGreaterThanOrEqual(-0.001);
    expect(max[2]).toBeGreaterThan(1.65);
    expect(max[2]).toBeLessThan(1.85);
    // About 1.1 to 1.3 m from wheel to wheel, 0.7 m or less across the bar.
    const length = max[1] - min[1];
    expect(length).toBeGreaterThan(1.05);
    expect(length).toBeLessThan(1.4);
    expect(max[0] - min[0]).toBeLessThan(0.75);
  });

  it("is centred on its origin so the heading marker lines up with it", () => {
    expect((min[0] + max[0]) / 2).toBeCloseTo(0, 1);
    expect((min[1] + max[1]) / 2).toBeCloseTo(0, 1);
  });
});

describe("chevron mesh", () => {
  it("is a flat arrow about two metres wide that points forward", () => {
    const { min, max } = buildChevronMesh();
    expect(max[0] - min[0]).toBeCloseTo(2, 1);
    expect(max[2] - min[2]).toBeLessThan(0.1);
    // The tip is the farthest forward point and lies on the middle line.
    const mesh = buildChevronMesh();
    let tipX = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (Math.abs(mesh.positions[i + 1]! - max[1]) < 1e-6) tipX = mesh.positions[i]!;
    }
    expect(Math.abs(tipX)).toBeLessThan(1e-6);
  });
});

describe("beacon mesh", () => {
  it("is a tall column with a ring at its foot", () => {
    const { min, max } = buildBeaconMesh();
    expect(max[2]).toBeCloseTo(BEACON_HEIGHT_METRES, 3);
    expect(min[2]).toBeCloseTo(0, 3);
    expect(max[0]).toBeGreaterThan(1.5);
  });
});

describe("heading mesh", () => {
  it("is flat on the ground with a cone that reaches ahead of the ring", () => {
    const { min, max } = buildHeadingMesh();
    expect(max[2]).toBeLessThan(0.1);
    expect(min[2]).toBeGreaterThanOrEqual(0);
    expect(max[1]).toBeGreaterThan(3);
    expect(min[1]).toBeLessThan(-0.9);
  });
});

describe("meshFor", () => {
  it("builds each mesh once and shares it", () => {
    expect(meshFor("rider")).toBe(meshFor("rider"));
    expect(meshFor("chevron")).not.toBe(meshFor("beacon"));
  });
});
