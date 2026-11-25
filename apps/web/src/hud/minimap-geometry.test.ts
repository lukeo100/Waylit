import { describe, expect, it } from "vitest";
import { DEMO_ROUTE, createRouteIndex, locateAlongRoute } from "@waylit/core";
import {
  HEADING_CONE,
  MINIMAP_VIEW,
  createMinimapRoute,
  followTransform,
  headingConePath,
  overviewTransform,
  pointsAttribute,
  splitRoute,
  toLocal,
} from "./minimap-geometry";

const index = createRouteIndex(DEMO_ROUTE.path);
const route = createMinimapRoute(DEMO_ROUTE.path, index.cumulativeMetres);

describe("minimap geometry", () => {
  it("puts the route start at the origin with north as negative y", () => {
    expect(route.points[0]).toEqual({ x: 0, y: 0 });
    const north = toLocal({ lat: 52, lng: 13 }, { lat: 52.001, lng: 13 });
    expect(north.y).toBeLessThan(0);
    const east = toLocal({ lat: 52, lng: 13 }, { lat: 52, lng: 13.001 });
    expect(east.x).toBeGreaterThan(0);
  });

  it("splits the route at the rider into a passed and an ahead part that meet", () => {
    const { passed, ahead } = splitRoute(route, 1000);
    expect(passed[passed.length - 1]).toEqual(ahead[0]);
    expect(passed.length + ahead.length).toBeGreaterThan(3);
    const at = locateAlongRoute(index, 1000).position;
    const cut = toLocal(route.origin, at);
    expect(passed[passed.length - 1]!.x).toBeCloseTo(cut.x, 0);
    expect(passed[passed.length - 1]!.y).toBeCloseTo(cut.y, 0);
  });

  it("handles the ends of the route", () => {
    expect(splitRoute(route, 0).passed).toHaveLength(2);
    expect(splitRoute(route, -5).ahead[0]).toEqual(route.points[0]);
    const end = splitRoute(route, 1e9);
    expect(end.ahead[0]).toEqual(route.points[route.points.length - 1]);
  });

  it("formats points for an SVG attribute", () => {
    expect(
      pointsAttribute([
        { x: 1.26, y: -2 },
        { x: 3, y: 4.04 },
      ]),
    ).toBe("1.3,-2 3,4");
  });

  it("turns the map so the heading points up", () => {
    const t = followTransform({ x: 10, y: 20 }, 90);
    expect(t).toContain(`translate(${MINIMAP_VIEW.riderX} ${MINIMAP_VIEW.riderY})`);
    expect(t).toContain("rotate(-90)");
    expect(t).toContain("translate(-10 -20)");
  });

  it("fits the whole route inside the round map for the overview", () => {
    const { scale } = overviewTransform(route);
    const xs = route.points.map((p) => p.x);
    const ys = route.points.map((p) => p.y);
    const centreX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centreY = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const p of route.points) {
      const distance = Math.hypot(p.x - centreX, p.y - centreY) * scale;
      expect(distance).toBeLessThanOrEqual(MINIMAP_VIEW.radius * MINIMAP_VIEW.overviewFill + 0.5);
    }
  });

  it("draws a heading cone that opens upward and is wide enough to see", () => {
    const path = headingConePath();
    expect(path.startsWith("M0 0 L-")).toBe(true);
    // 34 units long and 32 degrees either side, so about 36 units across at the far edge.
    expect(path).toContain("L-18 -28.8");
    expect(path).toContain("A34 34 0 0 1 18 -28.8");
    expect(HEADING_CONE.length).toBeGreaterThanOrEqual(24);
    expect(HEADING_CONE.halfAngleDegrees).toBeGreaterThanOrEqual(25);
  });
});
