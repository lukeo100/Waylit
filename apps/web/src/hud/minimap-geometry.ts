import { toLocalMetres, type LatLng } from "@waylit/core";

/**
 * Geometry for the minimap. The minimap is a plain drawn route: a polyline, a position dot and
 * a heading, with no map tiles and no map data from any provider. Everything here is pure maths
 * on the route's own coordinates, so it is easy to test and has no DOM.
 *
 * Coordinates are metres east (x) and metres south (y) of the route's first point, so they
 * can go straight into an SVG whose y axis points down.
 */

export interface LocalPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The minimap's SVG view box and where the rider sits in it. The minimap is a circle, so the
 * box is square and the corners are never seen.
 */
export const MINIMAP_VIEW = {
  width: 100,
  height: 100,
  /** The rider sits a little below the centre so more of the road ahead shows. */
  riderX: 50,
  riderY: 60,
  /** Scale while following the rider, in SVG units per metre. 0.22 shows about 450 m across. */
  unitsPerMetre: 0.22,
  /** Radius of the visible circle, in SVG units. */
  radius: 50,
  /** Part of the circle's radius the whole route may fill in the overview. */
  overviewFill: 0.84,
} as const;

/** The heading cone: how far it reaches from the rider and how wide it opens, in SVG units. */
export const HEADING_CONE = { length: 34, halfAngleDegrees: 32 } as const;

/**
 * Path for the heading cone: a wedge with its point at the origin, opening straight up. The
 * map is turned so the heading is up, so the wedge always shows where the rider faces.
 */
export function headingConePath(
  length: number = HEADING_CONE.length,
  halfAngleDegrees: number = HEADING_CONE.halfAngleDegrees,
): string {
  const a = (halfAngleDegrees * Math.PI) / 180;
  const dx = round1(length * Math.sin(a));
  const dy = round1(-length * Math.cos(a));
  return `M0 0 L${-dx} ${dy} A${length} ${length} 0 0 1 ${dx} ${dy} Z`;
}

export interface MinimapRoute {
  readonly origin: LatLng;
  readonly points: readonly LocalPoint[];
  /** Distance along the route of each point, in metres. */
  readonly cumulativeMetres: readonly number[];
}

/**
 * Prepares a route for drawing. `cumulativeMetres` is the distance to each vertex, for example
 * from `createRouteIndex`.
 */
export function createMinimapRoute(
  path: readonly LatLng[],
  cumulativeMetres: readonly number[],
): MinimapRoute {
  const origin = path[0] as LatLng;
  return {
    origin,
    points: path.map((position) => toLocal(origin, position)),
    cumulativeMetres,
  };
}

export function toLocal(origin: LatLng, position: LatLng): LocalPoint {
  const { east, north } = toLocalMetres(origin, position);
  return { x: east, y: -north || 0 };
}

/** Splits the route at a distance along it, into the part behind the rider and the part ahead. */
export function splitRoute(
  route: MinimapRoute,
  alongMetres: number,
): { passed: LocalPoint[]; ahead: LocalPoint[] } {
  const { points, cumulativeMetres } = route;
  const last = cumulativeMetres[cumulativeMetres.length - 1] as number;
  const d = Math.min(Math.max(alongMetres, 0), last);
  let segment = 0;
  while (segment < points.length - 2 && (cumulativeMetres[segment + 1] as number) <= d) segment++;
  const a = points[segment] as LocalPoint;
  const b = points[segment + 1] as LocalPoint;
  const start = cumulativeMetres[segment] as number;
  const length = (cumulativeMetres[segment + 1] as number) - start;
  const t = length > 0 ? (d - start) / length : 0;
  const cut: LocalPoint = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return {
    passed: [...points.slice(0, segment + 1), cut],
    ahead: [cut, ...points.slice(segment + 1)],
  };
}

/** Formats points for an SVG `points` attribute, to one decimal place. */
export function pointsAttribute(points: readonly LocalPoint[]): string {
  return points.map((p) => `${round1(p.x)},${round1(p.y)}`).join(" ");
}

/**
 * SVG transform that centres the minimap on the rider with the heading pointing up. Apply it
 * to a group that holds the route in local metres.
 */
export function followTransform(rider: LocalPoint, headingDegrees: number): string {
  const { riderX, riderY, unitsPerMetre } = MINIMAP_VIEW;
  return [
    `translate(${riderX} ${riderY})`,
    `rotate(${round1(-headingDegrees)})`,
    `scale(${unitsPerMetre})`,
    `translate(${round1(-rider.x)} ${round1(-rider.y)})`,
  ].join(" ");
}

export interface OverviewView {
  readonly transform: string;
  /** SVG units per metre. */
  readonly scale: number;
}

/**
 * A north-up view that fits the whole route inside the circle, for the start and summary
 * screens. It fits by the furthest point from the middle, so a corner of the route's bounding
 * box can never fall outside the round map.
 */
export function overviewTransform(route: MinimapRoute): OverviewView {
  const { width, height, radius, overviewFill } = MINIMAP_VIEW;
  const xs = route.points.map((p) => p.x);
  const ys = route.points.map((p) => p.y);
  const centreX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centreY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const reach = Math.max(...route.points.map((p) => Math.hypot(p.x - centreX, p.y - centreY)), 1);
  const scale = (radius * overviewFill) / reach;
  return {
    scale,
    transform: `translate(${width / 2} ${height / 2}) scale(${round4(scale)}) translate(${round1(-centreX)} ${round1(-centreY)})`,
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
