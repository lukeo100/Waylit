import { describe, expect, it } from "vitest";
import { DEMO_ROUTE, DEMO_ROUTE_FEATURE } from "./demo-route";
import { haversineDistance, bearingDegrees, normaliseDegrees, shortestAngleDelta } from "./geo";
import { createRouteIndex, locateAlongRoute, pathFromFeature, pathLength } from "./route";

describe("geo helpers", () => {
  it("bearing is 90 degrees due east and 0 due north", () => {
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 6);
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 6);
  });

  it("normalises and measures angles", () => {
    expect(normaliseDegrees(-10)).toBe(350);
    expect(normaliseDegrees(370)).toBe(10);
    expect(shortestAngleDelta(350, 10)).toBe(20);
    expect(shortestAngleDelta(10, 350)).toBe(-20);
  });
});

describe("route index", () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0.001, lng: 0.001 },
  ];

  it("needs at least two points", () => {
    expect(() => createRouteIndex([{ lat: 0, lng: 0 }])).toThrow();
  });

  it("finds points and headings along the path", () => {
    const index = createRouteIndex(path);
    const first = haversineDistance(path[0]!, path[1]!);
    const start = locateAlongRoute(index, 0);
    expect(start.heading).toBeCloseTo(90, 3);
    const mid = locateAlongRoute(index, first / 2);
    expect(mid.position.lng).toBeCloseTo(0.0005, 6);
    const afterTurn = locateAlongRoute(index, first + 10);
    expect(afterTurn.heading).toBeCloseTo(0, 3);
    expect(afterTurn.segmentIndex).toBe(1);
  });

  it("clamps distances to the route", () => {
    const index = createRouteIndex(path);
    expect(locateAlongRoute(index, -5).position).toEqual(path[0]);
    expect(locateAlongRoute(index, 1e9).position).toEqual(path[2]);
  });
});

describe("demo route", () => {
  const path = pathFromFeature(DEMO_ROUTE_FEATURE);

  it("is a GeoJSON LineString with longitude first", () => {
    expect(DEMO_ROUTE_FEATURE.geometry.type).toBe("LineString");
    const [lng, lat] = DEMO_ROUTE_FEATURE.geometry.coordinates[0]!;
    expect(lng).toBeCloseTo(13.4, 1);
    expect(lat).toBeCloseTo(52.47, 1);
  });

  it("is a closed loop of a few kilometres", () => {
    expect(haversineDistance(path[0]!, path[path.length - 1]!)).toBeLessThan(1);
    expect(DEMO_ROUTE.distanceMetres).toBeCloseTo(pathLength(path), 6);
    expect(DEMO_ROUTE.distanceMetres).toBeGreaterThan(3500);
    expect(DEMO_ROUTE.distanceMetres).toBeLessThan(5000);
  });

  it("is a closed loop", () => {
    expect(haversineDistance(path[0]!, path.at(-1)!)).toBeLessThan(50);
  });

  it("has instructions that start with depart and end with arrive", () => {
    expect(DEMO_ROUTE.instructions[0]?.manoeuvre).toBe("depart");
    expect(DEMO_ROUTE.instructions.at(-1)?.manoeuvre).toBe("arrive");
  });

  it("has no jumps between points", () => {
    for (let i = 1; i < path.length; i++) {
      expect(haversineDistance(path[i - 1]!, path[i]!)).toBeLessThan(700);
    }
  });
});
