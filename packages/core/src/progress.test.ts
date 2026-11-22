import { describe, expect, it } from "vitest";
import { DEMO_ROUTE } from "./demo-route";
import { fromLocalMetres } from "./geo";
import { computeProgress, createProgressModel } from "./progress";
import { createRouteIndex, locateAlongRoute, locateInstructions, projectOntoRoute } from "./route";
import type { Route } from "./navigation";

const origin = { lat: 52.47, lng: 13.4 };
// An L shape: 100 m east, then 100 m north.
const lShape = [
  origin,
  fromLocalMetres(origin, { east: 100, north: 0 }),
  fromLocalMetres(origin, { east: 100, north: 100 }),
];

describe("projectOntoRoute", () => {
  const index = createRouteIndex(lShape);

  it("finds the distance along the route and the offset from it", () => {
    const point = fromLocalMetres(origin, { east: 40, north: 5 });
    const result = projectOntoRoute(index, point);
    expect(result.distanceMetres).toBeCloseTo(40, 0);
    expect(result.offsetMetres).toBeCloseTo(5, 0);
  });

  it("clamps to the ends of the route", () => {
    const before = projectOntoRoute(index, fromLocalMetres(origin, { east: -30, north: 0 }));
    expect(before.distanceMetres).toBe(0);
    const after = projectOntoRoute(index, fromLocalMetres(origin, { east: 100, north: 160 }));
    expect(after.distanceMetres).toBeCloseTo(index.totalMetres, 3);
  });

  it("follows the second leg after the corner", () => {
    const result = projectOntoRoute(index, fromLocalMetres(origin, { east: 103, north: 60 }));
    expect(result.distanceMetres).toBeCloseTo(160, 0);
  });

  it("uses a hint so a closed loop does not jump back to the start", () => {
    const end = DEMO_ROUTE.path[DEMO_ROUTE.path.length - 1]!;
    const loopIndex = createRouteIndex(DEMO_ROUTE.path);
    const noHint = projectOntoRoute(loopIndex, end);
    expect(noHint.distanceMetres).toBeCloseTo(0, 3);
    const hinted = projectOntoRoute(loopIndex, end, { hintMetres: loopIndex.totalMetres - 5 });
    expect(hinted.distanceMetres).toBeCloseTo(loopIndex.totalMetres, 3);
  });

  it("recovers when the hint is outside the route", () => {
    const point = fromLocalMetres(origin, { east: 40, north: 0 });
    const result = projectOntoRoute(index, point, { hintMetres: 5000, behindMetres: 0 });
    expect(result.distanceMetres).toBeCloseTo(40, 0);
  });

  it("agrees with locateAlongRoute on the demo route", () => {
    const loopIndex = createRouteIndex(DEMO_ROUTE.path);
    for (const d of [0, 250, 1000, 2500, 4000]) {
      const point = locateAlongRoute(loopIndex, d).position;
      const result = projectOntoRoute(loopIndex, point, { hintMetres: d });
      expect(result.distanceMetres).toBeCloseTo(d, 0);
      expect(result.offsetMetres).toBeLessThan(0.5);
    }
  });
});

describe("locateInstructions", () => {
  it("places the demo instructions in order from start to finish", () => {
    const index = createRouteIndex(DEMO_ROUTE.path);
    const located = locateInstructions(index, DEMO_ROUTE.instructions);
    expect(located).toHaveLength(DEMO_ROUTE.instructions.length);
    expect(located[0]).toBeCloseTo(0, 3);
    expect(located[located.length - 1]).toBeCloseTo(index.totalMetres, 3);
    for (let i = 1; i < located.length; i++) {
      expect(located[i]!).toBeGreaterThanOrEqual(located[i - 1]!);
    }
  });
});

describe("computeProgress", () => {
  const route: Route = {
    path: lShape,
    distanceMetres: 200,
    instructions: [
      { manoeuvre: "depart", text: "Head east", at: lShape[0]! },
      { manoeuvre: "turn-left", text: "Turn left", at: lShape[1]! },
      { manoeuvre: "arrive", text: "Arrive", at: lShape[2]! },
    ],
  };
  const model = createProgressModel(route);
  const now = 1_000_000;

  it("shows the depart instruction at the very start", () => {
    const p = computeProgress(model, { distanceAlongMetres: 0, paceMps: 5, nowMs: now });
    expect(p.nextInstruction?.manoeuvre).toBe("depart");
    expect(p.arrived).toBe(false);
  });

  it("counts down to the next turn and skips the departure once moving", () => {
    const p = computeProgress(model, { distanceAlongMetres: 30, paceMps: 5, nowMs: now });
    expect(p.nextInstruction?.manoeuvre).toBe("turn-left");
    expect(p.distanceToNextMetres).toBeCloseTo(70, 0);
    expect(p.remainingDistanceMetres).toBeCloseTo(170, 0);
  });

  it("works out remaining time and arrival from the pace", () => {
    const p = computeProgress(model, { distanceAlongMetres: 100, paceMps: 5, nowMs: now });
    expect(p.remainingDurationSeconds).toBeCloseTo(20, 0);
    expect(p.etaTimestamp).toBeCloseTo(now + 20_000, -2);
  });

  it("leaves time and arrival out when there is no pace", () => {
    const p = computeProgress(model, { distanceAlongMetres: 100, nowMs: now });
    expect(p.remainingDurationSeconds).toBeUndefined();
    expect(p.etaTimestamp).toBeUndefined();
    expect(p.remainingDistanceMetres).toBeGreaterThan(0);
  });

  it("reports arrival at the end", () => {
    const p = computeProgress(model, { distanceAlongMetres: 1e6, paceMps: 5, nowMs: now });
    expect(p.arrived).toBe(true);
    expect(p.nextInstruction?.manoeuvre).toBe("arrive");
    expect(p.remainingDistanceMetres).toBe(0);
    expect(p.remainingDurationSeconds).toBe(0);
  });
});
