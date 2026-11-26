import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_ROUTE,
  computeProgress,
  createProgressModel,
  formatDistance,
  fromLocalMetres,
  haversineDistance,
  locateAlongRoute,
  nextTurn,
  toLocalMetres,
  type LatLng,
  type Route,
} from "@waylit/core";
import { RouteGuide, corridorShape, freeRideFrame, offsetPath } from "./guidance";
import { CORRIDOR_WIDTH_METRES } from "./holo";

const origin = { lat: 52.47, lng: 13.4 };
// 200 m east, then 200 m north: one clean left turn at 200 m.
const lShape: LatLng[] = [
  origin,
  fromLocalMetres(origin, { east: 200, north: 0 }),
  fromLocalMetres(origin, { east: 200, north: 200 }),
];
const lRoute: Route = {
  path: lShape,
  distanceMetres: 400,
  instructions: [
    { manoeuvre: "depart", text: "Start", at: lShape[0]! },
    { manoeuvre: "turn-left", text: "Turn left", at: lShape[1]! },
    { manoeuvre: "arrive", text: "Arrive", at: lShape[2]! },
  ],
};

describe("offsetPath", () => {
  it("keeps a straight path parallel at the offset distance, left positive", () => {
    const straight = [origin, fromLocalMetres(origin, { east: 100, north: 0 })];
    const left = offsetPath(straight, 2);
    const a = toLocalMetres(origin, left[0]!);
    expect(a.east).toBeCloseTo(0, 6);
    expect(a.north).toBeCloseTo(2, 6);
    const right = offsetPath(straight, -2);
    expect(toLocalMetres(origin, right[1]!).north).toBeCloseTo(-2, 6);
  });

  it("mitres a corner so the offset stays the same distance from both legs", () => {
    const left = offsetPath(lShape, 1.7);
    // Going east then north, left is the inside of the corner: it moves to (198.3, 1.7).
    const corner = toLocalMetres(origin, left[1]!);
    expect(corner.east).toBeCloseTo(198.3, 3);
    expect(corner.north).toBeCloseTo(1.7, 3);
  });

  it("copes with duplicate points and short paths", () => {
    expect(offsetPath([origin], 1)).toEqual([origin]);
    const dup = offsetPath([origin, origin, fromLocalMetres(origin, { east: 10, north: 0 })], 1);
    expect(dup).toHaveLength(3);
    for (const p of dup) expect(Number.isFinite(p.lat) && Number.isFinite(p.lng)).toBe(true);
  });
});

describe("corridorShape", () => {
  it("makes a ribbon of the right width, as a closed ring", () => {
    const shape = corridorShape(lShape);
    expect(shape.widthMetres).toBe(CORRIDOR_WIDTH_METRES);
    expect(shape.leftRail).toHaveLength(3);
    expect(shape.rightRail).toHaveLength(3);
    expect(shape.ribbon).toHaveLength(6);
    const gap = haversineDistance(shape.leftRail[0]!, shape.rightRail[0]!);
    expect(gap).toBeCloseTo(CORRIDOR_WIDTH_METRES, 2);
  });

  it("builds from the whole demo route without bad numbers", () => {
    const shape = corridorShape(DEMO_ROUTE.path);
    expect(shape.ribbon).toHaveLength(DEMO_ROUTE.path.length * 2);
    for (const p of shape.ribbon) {
      expect(Number.isFinite(p.lat) && Number.isFinite(p.lng)).toBe(true);
    }
    // Rails never drift far from the route, even at the tight corners.
    for (let i = 0; i < DEMO_ROUTE.path.length; i++) {
      expect(haversineDistance(DEMO_ROUTE.path[i]!, shape.leftRail[i]!)).toBeLessThan(5);
      expect(haversineDistance(DEMO_ROUTE.path[i]!, shape.rightRail[i]!)).toBeLessThan(5);
    }
  });
});

describe("RouteGuide.frame", () => {
  const guide = new RouteGuide(lRoute);

  it("always draws the rider and the heading marker at the rider", () => {
    const rider = fromLocalMetres(origin, { east: 50, north: 0 });
    const frame = guide.frame(rider, 90, 1000);
    const kinds = frame.items.map((i) => i.kind);
    expect(kinds).toContain("rider");
    expect(kinds).toContain("heading");
    for (const item of frame.items.filter((i) => i.kind === "rider" || i.kind === "heading")) {
      expect(item.position).toEqual(rider);
      expect(item.headingDegrees).toBe(90);
    }
    expect(frame.alongMetres).toBeCloseTo(50, 1);
    expect(frame.offRoute).toBe(false);
  });

  it("puts chevrons ahead of the rider on fixed spots along the route", () => {
    guide.reset();
    const a = guide.frame(fromLocalMetres(origin, { east: 20, north: 0 }), 90, 0);
    const chevrons = a.items.filter((i) => i.kind === "chevron");
    expect(chevrons.length).toBeGreaterThan(5);
    const model = createProgressModel(lRoute);
    for (const c of chevrons) {
      const east = toLocalMetres(origin, c.position).east;
      expect(east).toBeGreaterThan(20 + 4);
      expect(c.liftMetres).toBeGreaterThan(0);
      expect(c.alpha).toBeGreaterThan(0);
      expect(c.alpha).toBeLessThanOrEqual(1);
      expect(c.headingDegrees).toBeCloseTo(90, 0);
      expect(model.index.totalMetres).toBeGreaterThan(0);
    }
    // They stand on multiples of the spacing, so a small move shows the same spots.
    const b = guide.frame(fromLocalMetres(origin, { east: 22, north: 0 }), 90, 100);
    const spotsA = chevrons.map((c) => Math.round(toLocalMetres(origin, c.position).east));
    const spotsB = b.items
      .filter((i) => i.kind === "chevron")
      .map((i) => Math.round(toLocalMetres(origin, i.position).east));
    for (const spot of spotsB.filter((s) => s > 30 && s < 80)) expect(spotsA).toContain(spot);
  });

  it("fades chevrons in near the rider and out toward the far end", () => {
    guide.reset();
    const frame = guide.frame(origin, 90, 0);
    const chevrons = frame.items.filter((i) => i.kind === "chevron");
    const alphas = chevrons.map((c) => c.alpha);
    expect(alphas[0]!).toBeLessThan(Math.max(...alphas));
    expect(alphas[alphas.length - 1]!).toBeLessThan(Math.max(...alphas));
  });

  it("bends the chevrons into the turn", () => {
    guide.reset();
    const frame = guide.frame(fromLocalMetres(origin, { east: 150, north: 0 }), 90, 0);
    const headings = frame.items.filter((i) => i.kind === "chevron").map((i) => i.headingDegrees);
    expect(headings[0]).toBeCloseTo(90, 0);
    // The last chevrons are on the northbound leg.
    const last = headings[headings.length - 1]!;
    expect(Math.min(last, 360 - last)).toBeLessThan(20);
  });

  it("shows no beacon while the turn is far, then counts down as the rider closes in", () => {
    // A long first leg: the turn is 600 m away at the start, beyond the approach distance.
    const far: LatLng[] = [
      origin,
      fromLocalMetres(origin, { east: 600, north: 0 }),
      fromLocalMetres(origin, { east: 600, north: 100 }),
    ];
    const farGuide = new RouteGuide({
      path: far,
      distanceMetres: 700,
      instructions: [
        { manoeuvre: "turn-left", text: "Turn left", at: far[1]! },
        { manoeuvre: "arrive", text: "Arrive", at: far[2]! },
      ],
    });
    expect(farGuide.frame(origin, 90, 0).beacon).toBeUndefined();
    expect(farGuide.frame(origin, 90, 0).items.some((i) => i.kind === "beacon")).toBe(false);
    guide.reset();
    const labels: string[] = [];
    let last = Infinity;
    for (const east of [0, 60, 110, 140, 170, 190, 198]) {
      const frame = guide.frame(fromLocalMetres(origin, { east, north: 0 }), 90, east * 10);
      if (!frame.beacon) continue;
      expect(frame.beacon.direction).toBe("left");
      expect(frame.beacon.distanceMetres).toBeLessThan(last);
      last = frame.beacon.distanceMetres;
      labels.push(frame.beacon.label);
      const beaconItems = frame.items.filter((i) => i.kind === "beacon");
      expect(beaconItems).toHaveLength(1);
      expect(toLocalMetres(origin, beaconItems[0]!.position).east).toBeCloseTo(200, 0);
    }
    expect(labels.length).toBeGreaterThanOrEqual(5);
    expect(labels[0]).toBe("200 m");
    expect(labels[labels.length - 1]).toBe("0 m");
  });

  it("matches the turn logic in core", () => {
    guide.reset();
    const model = createProgressModel(lRoute);
    const rider = fromLocalMetres(origin, { east: 120, north: 0 });
    const frame = guide.frame(rider, 90, 0);
    expect(frame.beacon?.label).toBe(nextTurn(model, frame.alongMetres)?.label);
    expect(frame.beacon?.phase).toBe(nextTurn(model, frame.alongMetres)?.phase);
  });

  it("makes the beacon brighter as the turn gets closer", () => {
    guide.reset();
    const alphaAt = (east: number): number =>
      guide
        .frame(fromLocalMetres(origin, { east, north: 0 }), 90, 0)
        .items.find((i) => i.kind === "beacon")!.alpha;
    expect(alphaAt(100)).toBeLessThan(alphaAt(160));
    expect(alphaAt(160)).toBeLessThan(alphaAt(199));
  });

  it("draws no chevrons or beacon when the rider is far off the route", () => {
    guide.reset();
    const frame = guide.frame(fromLocalMetres(origin, { east: 100, north: -400 }), 0, 0);
    expect(frame.offRoute).toBe(true);
    expect(frame.beacon).toBeUndefined();
    expect(frame.items.map((i) => i.kind).sort()).toEqual(["heading", "rider"]);
  });

  it("does not run chevrons past the end of the route", () => {
    guide.reset();
    const frame = guide.frame(fromLocalMetres(origin, { east: 200, north: 170 }), 0, 0);
    for (const c of frame.items.filter((i) => i.kind === "chevron")) {
      expect(toLocalMetres(origin, c.position).north).toBeLessThanOrEqual(200.5);
    }
  });
});

describe("RouteGuide.pointAt", () => {
  it("gives the position and the direction of the route at a distance", () => {
    const guide = new RouteGuide(lRoute);
    const first = guide.pointAt(100);
    expect(toLocalMetres(origin, first.position).east).toBeCloseTo(100, 1);
    expect(first.headingDegrees).toBeCloseTo(90, 0);
    const second = guide.pointAt(300);
    expect(toLocalMetres(origin, second.position).north).toBeCloseTo(100, 1);
    expect(Math.min(second.headingDegrees, 360 - second.headingDegrees)).toBeLessThan(1);
    expect(guide.pointAt(-5).position).toEqual(guide.pointAt(0).position);
  });
});

describe("RouteGuide on the demo route", () => {
  it("follows a rider around the loop without losing its place or throwing", () => {
    const guide = new RouteGuide(DEMO_ROUTE);
    const model = createProgressModel(DEMO_ROUTE);
    let last = 0;
    for (let d = 0; d < model.index.totalMetres - 5; d += 7) {
      const point = locateAlongRoute(model.index, d);
      const frame = guide.frame(point.position, point.heading, d * 100);
      expect(frame.offRoute).toBe(false);
      expect(frame.alongMetres).toBeGreaterThanOrEqual(last - 0.5);
      expect(Math.abs(frame.alongMetres - d)).toBeLessThan(1);
      last = frame.alongMetres;
      for (const item of frame.items) {
        expect(item.alpha).toBeGreaterThanOrEqual(0);
        expect(item.alpha).toBeLessThanOrEqual(1);
        expect(Number.isFinite(item.position.lat)).toBe(true);
      }
    }
  });
});

describe("the beacon and the HUD read the same distance", () => {
  const model = createProgressModel(DEMO_ROUTE);
  const guide = new RouteGuide(DEMO_ROUTE);
  // The guide remembers where the rider was, so every test starts from a clean slate.
  beforeEach(() => guide.reset());

  const frameAt = (along: number) => {
    const here = guide.pointAt(along);
    return guide.frame(here.position, here.headingDegrees, 0, along);
  };

  it("shows the same rounded distance as the HUD for every metre of the demo route", () => {
    let compared = 0;
    for (let along = 0; along <= model.index.totalMetres; along += 1) {
      const frame = frameAt(along);
      const hud = computeProgress(model, { distanceAlongMetres: along, nowMs: 0 });
      const beacon = frame.beacon;
      if (!beacon) continue;
      // Where the HUD names the same instruction, the text is identical.
      const turn = nextTurn(model, along)!;
      if (hud.nextInstruction === turn.instruction) {
        const shown = formatDistance(hud.distanceToNextMetres!);
        expect(beacon.label, `at ${String(along)} m`).toBe(`${shown.value} ${shown.unit}`);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(200);
  });

  it("handles the departure the same way at the very start: the HUD says depart, no beacon", () => {
    const hud = computeProgress(model, { distanceAlongMetres: 0, nowMs: 0 });
    expect(hud.nextInstruction?.manoeuvre).toBe("depart");
    expect(frameAt(0).beacon).toBeUndefined();
    // Once the rider has moved off, the HUD skips the departure and both name the next turn.
    const moving = computeProgress(model, { distanceAlongMetres: 2, nowMs: 0 });
    expect(moving.nextInstruction?.manoeuvre).not.toBe("depart");
    expect(moving.nextInstruction).toBe(nextTurn(model, 2)!.instruction);
  });

  it("uses the session distance for the beacon even when the rider is drawn a little behind", () => {
    const turn = nextTurn(model, 0)!;
    const sessionAlong = turn.atMetres - 40;
    const behind = guide.pointAt(sessionAlong - 6);
    const withSession = guide.frame(behind.position, behind.headingDegrees, 0, sessionAlong);
    const without = guide.frame(behind.position, behind.headingDegrees, 0);
    expect(withSession.beacon?.label).toBe("40 m");
    expect(without.beacon?.label).toBe("50 m");
  });

  it("ignores a session distance that is not a number", () => {
    const here = guide.pointAt(300);
    const a = guide.frame(here.position, here.headingDegrees, 0, Number.NaN);
    const b = guide.frame(here.position, here.headingDegrees, 0);
    expect(a.beacon).toEqual(b.beacon);
  });
});

describe("freeRideFrame", () => {
  const rider = fromLocalMetres(origin, { east: 10, north: 10 });

  it("has only the rider and the heading marker, no corridor, chevrons or beacon", () => {
    const frame = freeRideFrame(rider, 90, 1234);
    expect(frame.beacon).toBeUndefined();
    expect(frame.offRoute).toBe(false);
    expect(frame.nowMs).toBe(1234);
    expect(frame.items.map((i) => i.kind).sort()).toEqual(["heading", "rider"]);
    for (const item of frame.items) {
      expect(item.position).toEqual(rider);
      expect(item.headingDegrees).toBe(90);
    }
  });
});
