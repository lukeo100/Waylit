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

/** The minimap's SVG view box and where the rider sits in it. */
export const MINIMAP_VIEW = {
  width: 250,
  height: 100,
  /** The rider sits low in the box so more of the road ahead shows. */
  riderX: 125,
  riderY: 74,
  /** Scale while following the rider, in SVG units per metre. 0.3 shows about 800 m across. */
  unitsPerMetre: 0.3,
  /** Space kept free around the route in the overview, as a fraction of the box. */
  overviewMargin: 0.14,
} as const;

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

/** A north-up view that fits the whole route in the box, for the start and summary screens. */
export function overviewTransform(route: MinimapRoute): OverviewView {
  const { width, height, overviewMargin } = MINIMAP_VIEW;
  const xs = route.points.map((p) => p.x);
  const ys = route.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min(
    (width * (1 - 2 * overviewMargin)) / spanX,
    (height * (1 - 2 * overviewMargin)) / spanY,
  );
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  return {
    scale,
    transform: `translate(${width / 2} ${height / 2}) scale(${round4(scale)}) translate(${round1(-centreX)} ${round1(-centreY)})`,
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
