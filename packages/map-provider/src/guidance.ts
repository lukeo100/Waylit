import {
  bearingDegrees,
  createProgressModel,
  fromLocalMetres,
  locateAlongRoute,
  nextTurn,
  normaliseDegrees,
  projectOntoRoute,
  toLocalMetres,
  type LatLng,
  type LocalMetres,
  type ProgressModel,
  type Route,
} from "@waylit/core";
import { CORRIDOR_RAIL_METRES, CORRIDOR_WIDTH_METRES, pulse01 } from "./holo";
import { BEACON_HEIGHT_METRES } from "./holo-model";
import type { BeaconState, CorridorShape, GuidanceFrame, HoloItem } from "./types";

/**
 * Route guidance for the hologram layer, as plain maths with no renderer. From a route and the
 * rider's position it works out the corridor shape (once), then each frame the floating
 * chevrons that follow the route, the turn beacon with its distance countdown, and the rider
 * and heading marker. A provider only draws what comes out.
 *
 * Nothing here reads a map, a tile or a height. Positions are latitude and longitude along the
 * route, and the provider decides how high to draw them (a constant in Google mode).
 */

export interface RouteGuideOptions {
  /** Width of the corridor ribbon in metres. */
  readonly corridorWidthMetres?: number;
  /** Width of each rail in metres. */
  readonly railWidthMetres?: number;
  /** Distance between chevrons along the route in metres. */
  readonly chevronSpacingMetres?: number;
  /** The nearest chevron is at least this far ahead of the rider, in metres. */
  readonly chevronNearMetres?: number;
  /** The farthest chevron is this far ahead of the rider, in metres. */
  readonly chevronFarMetres?: number;
  /** How high chevrons float above the road, in metres. */
  readonly chevronLiftMetres?: number;
  /** Beyond this distance from the route the rider counts as off it, in metres. */
  readonly offRouteMetres?: number;
}

const DEFAULTS: Required<RouteGuideOptions> = {
  corridorWidthMetres: CORRIDOR_WIDTH_METRES,
  railWidthMetres: CORRIDOR_RAIL_METRES,
  chevronSpacingMetres: 7,
  chevronNearMetres: 5,
  chevronFarMetres: 70,
  chevronLiftMetres: 0.45,
  offRouteMetres: 40,
};

/** The most miter stretch at a corner, as a multiple of the half width. */
const MITER_LIMIT = 2.2;

/**
 * Offsets a path sideways by `offsetMetres` (positive to the left of travel), with mitred
 * corners. Worked out in a local flat plane around the first point, which is accurate to
 * centimetres across a few kilometres.
 */
export function offsetPath(path: readonly LatLng[], offsetMetres: number): LatLng[] {
  const origin = path[0];
  if (!origin || path.length < 2) return [...path];
  const local = path.map((p) => toLocalMetres(origin, p));
  const out: LatLng[] = [];
  for (let i = 0; i < local.length; i++) {
    const prev = local[Math.max(i - 1, 0)] as LocalMetres;
    const here = local[i] as LocalMetres;
    const next = local[Math.min(i + 1, local.length - 1)] as LocalMetres;
    // Left normals of the segments before and after the vertex.
    const a = unitLeft(prev, here) ?? unitLeft(here, next);
    const b = unitLeft(here, next) ?? a;
    if (!a || !b) {
      out.push(path[i] as LatLng);
      continue;
    }
    let mx = a.east + b.east;
    let my = a.north + b.north;
    const length = Math.hypot(mx, my);
    let scale = 1;
    if (length < 1e-9) {
      mx = a.east;
      my = a.north;
    } else {
      mx /= length;
      my /= length;
      // The miter length is 1 / cos(half the turn angle).
      const cosHalf = Math.max(mx * a.east + my * a.north, 1 / MITER_LIMIT);
      scale = 1 / cosHalf;
    }
    out.push(
      fromLocalMetres(origin, {
        east: here.east + mx * offsetMetres * scale,
        north: here.north + my * offsetMetres * scale,
      }),
    );
  }
  return out;
}

function unitLeft(a: LocalMetres, b: LocalMetres): LocalMetres | undefined {
  const dx = b.east - a.east;
  const dy = b.north - a.north;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return undefined;
  // Left of travel is the direction rotated a quarter turn counter clockwise.
  return { east: -dy / length, north: dx / length };
}

/** The static corridor shape for a path: ribbon, rails and the route itself. */
export function corridorShape(
  path: readonly LatLng[],
  widthMetres: number = CORRIDOR_WIDTH_METRES,
  railWidthMetres: number = CORRIDOR_RAIL_METRES,
): CorridorShape {
  const half = widthMetres / 2;
  const leftRail = offsetPath(path, half);
  const rightRail = offsetPath(path, -half);
  return {
    centre: path,
    widthMetres,
    railWidthMetres,
    leftRail,
    rightRail,
    ribbon: [...leftRail, ...[...rightRail].reverse()],
  };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Opacity of a beacon for a phase: faint when first seen, brightest at the turn. */
const BEACON_ALPHA = { far: 0, approaching: 0.6, imminent: 0.85, now: 1 } as const;

export class RouteGuide {
  readonly corridor: CorridorShape;
  private readonly model: ProgressModel;
  private readonly options: Required<RouteGuideOptions>;
  private hintMetres: number | undefined;

  constructor(route: Route, options: RouteGuideOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.model = createProgressModel(route);
    this.corridor = corridorShape(
      route.path,
      this.options.corridorWidthMetres,
      this.options.railWidthMetres,
    );
  }

  /** Forget where the rider was, for a new trip. */
  reset(): void {
    this.hintMetres = undefined;
  }

  get totalMetres(): number {
    return this.model.index.totalMetres;
  }

  /**
   * What to draw for a rider at `rider` heading `headingDegrees`, at time `nowMs`. The rider's
   * distance along the route comes from projecting the position onto it, using the last answer
   * as a hint so a closed loop never jumps from its end back to its start. That position places
   * the chevrons, which have to sit on the road ahead of the rider as drawn.
   *
   * `sessionAlongMetres` is the ride session's own distance along the route, the one the HUD
   * uses. When it is given, the turn beacon and its countdown use it, so the beacon and the HUD
   * read the same input and show the same distance. Without it the projected position is used.
   */
  frame(
    rider: LatLng,
    headingDegrees: number,
    nowMs: number,
    sessionAlongMetres?: number,
  ): GuidanceFrame {
    const o = this.options;
    const projection = projectOntoRoute(
      this.model.index,
      rider,
      this.hintMetres === undefined
        ? {}
        : { hintMetres: this.hintMetres, behindMetres: 25, aheadMetres: 80 },
    );
    this.hintMetres = projection.distanceMetres;
    const along = projection.distanceMetres;
    const offRoute = projection.offsetMetres > o.offRouteMetres;

    const items: HoloItem[] = [
      {
        kind: "heading",
        position: rider,
        headingDegrees,
        scale: 1,
        alpha: 0.9,
        pulse: pulse01(nowMs, 2400),
        liftMetres: 0,
      },
      {
        kind: "rider",
        position: rider,
        headingDegrees,
        scale: 1,
        alpha: 1,
        pulse: pulse01(nowMs, 3200),
        liftMetres: 0,
      },
    ];

    let beacon: BeaconState | undefined;
    if (!offRoute) {
      items.push(...this.chevrons(along, nowMs));
      const turnAlong =
        sessionAlongMetres !== undefined && Number.isFinite(sessionAlongMetres)
          ? sessionAlongMetres
          : along;
      const turn = nextTurn(this.model, turnAlong);
      if (turn && turn.phase !== "far") {
        const position = locateAlongRoute(this.model.index, turn.atMetres).position;
        beacon = {
          position,
          direction: turn.direction,
          phase: turn.phase,
          label: turn.label,
          distanceMetres: turn.distanceMetres,
          heightMetres: BEACON_HEIGHT_METRES,
        };
        items.push({
          kind: "beacon",
          position,
          headingDegrees: 0,
          scale: 1,
          alpha: BEACON_ALPHA[turn.phase],
          pulse: pulse01(nowMs, turn.phase === "approaching" ? 1800 : 900),
          liftMetres: 0,
        });
      }
    }
    return { nowMs, alongMetres: along, offRoute, items, beacon };
  }

  /**
   * Chevrons stand at fixed distances along the route (multiples of the spacing), so they do not
   * slide under the rider's position noise. They fade in near the rider and out toward the far
   * end, and a soft pulse travels along them toward the rider's direction of travel. Their
   * heading is the direction of the route at their own spot, so they bend into the next turn.
   */
  private chevrons(along: number, nowMs: number): HoloItem[] {
    const o = this.options;
    const total = this.model.index.totalMetres;
    const first = Math.ceil((along + o.chevronNearMetres) / o.chevronSpacingMetres);
    const items: HoloItem[] = [];
    for (let k = first; ; k++) {
      const s = k * o.chevronSpacingMetres;
      const ahead = s - along;
      if (ahead > o.chevronFarMetres || s > total - 1) break;
      const fadeIn = clamp01((ahead - o.chevronNearMetres) / 6);
      const fadeOut = clamp01((o.chevronFarMetres - ahead) / (o.chevronFarMetres * 0.45));
      const alpha = fadeIn * fadeOut;
      if (alpha < 0.02) continue;
      const here = locateAlongRoute(this.model.index, s).position;
      items.push({
        kind: "chevron",
        position: here,
        headingDegrees: this.routeHeadingAt(s),
        scale: 1,
        alpha,
        // The wave runs from far to near, so the chevrons seem to flow toward the rider.
        pulse: pulse01(nowMs, 2100, ahead / 60),
        liftMetres: o.chevronLiftMetres,
        slot: k,
      });
    }
    return items;
  }

  /** The position on the route at a distance along it, and the heading there. */
  pointAt(metres: number): { position: LatLng; headingDegrees: number } {
    return {
      position: locateAlongRoute(this.model.index, metres).position,
      headingDegrees: this.routeHeadingAt(metres),
    };
  }

  /** The direction of the route at a distance, smoothed over a few metres either side. */
  routeHeadingAt(metres: number): number {
    const index = this.model.index;
    const back = locateAlongRoute(index, metres - 2.5).position;
    const front = locateAlongRoute(index, metres + 2.5).position;
    const a = metres - 2.5 < 0 ? locateAlongRoute(index, 0).position : back;
    return normaliseDegrees(bearingDegrees(a, front));
  }
}
