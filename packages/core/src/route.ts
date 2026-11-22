import { bearingDegrees, haversineDistance, interpolateLatLng, toLocalMetres } from "./geo";
import type { RouteInstruction } from "./navigation";
import type { LatLng } from "./types";

/** A GeoJSON LineString. Coordinates are [longitude, latitude], as in RFC 7946. */
export interface RouteLineString {
  readonly type: "LineString";
  readonly coordinates: readonly (readonly [number, number])[];
}

/** A GeoJSON Feature that carries a route line. */
export interface RouteFeature {
  readonly type: "Feature";
  readonly properties: { readonly name: string; readonly description?: string };
  readonly geometry: RouteLineString;
}

/** Converts a GeoJSON route into the `LatLng` path used everywhere else. */
export function pathFromFeature(feature: RouteFeature): LatLng[] {
  return feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

/** Total length of a path in metres. */
export function pathLength(path: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineDistance(path[i - 1] as LatLng, path[i] as LatLng);
  }
  return total;
}

/** A path with its cumulative distances worked out, so positions can be looked up quickly. */
export interface RouteIndex {
  readonly path: readonly LatLng[];
  /** Distance in metres from the start to each vertex. The first entry is 0. */
  readonly cumulativeMetres: readonly number[];
  readonly totalMetres: number;
}

export function createRouteIndex(path: readonly LatLng[]): RouteIndex {
  if (path.length < 2) {
    throw new Error("A route needs at least two points.");
  }
  const cumulativeMetres: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const step = haversineDistance(path[i - 1] as LatLng, path[i] as LatLng);
    cumulativeMetres.push((cumulativeMetres[i - 1] as number) + step);
  }
  return {
    path,
    cumulativeMetres,
    totalMetres: cumulativeMetres[cumulativeMetres.length - 1] as number,
  };
}

export interface RoutePoint {
  readonly position: LatLng;
  /** Heading of the segment the point is on, degrees clockwise from north. */
  readonly heading: number;
  /** Index of the vertex at the start of the segment. */
  readonly segmentIndex: number;
}

/** Finds the point a given distance along the route. Distance is clamped to the route. */
export function locateAlongRoute(index: RouteIndex, distanceMetres: number): RoutePoint {
  const { path, cumulativeMetres, totalMetres } = index;
  const d = Math.min(Math.max(distanceMetres, 0), totalMetres);
  let lo = 0;
  let hi = cumulativeMetres.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((cumulativeMetres[mid] as number) <= d) lo = mid;
    else hi = mid - 1;
  }
  const a = path[lo] as LatLng;
  const b = path[lo + 1] as LatLng;
  const segStart = cumulativeMetres[lo] as number;
  const segLength = (cumulativeMetres[lo + 1] as number) - segStart;
  const t = segLength > 0 ? (d - segStart) / segLength : 0;
  return { position: interpolateLatLng(a, b, t), heading: bearingDegrees(a, b), segmentIndex: lo };
}

/** Where a position sits relative to a route. */
export interface RouteProjection {
  /** Distance along the route to the closest point, in metres. */
  readonly distanceMetres: number;
  /** How far the position is from the route, in metres. */
  readonly offsetMetres: number;
}

export interface ProjectOptions {
  /**
   * A recent distance along the route. When given, only the stretch around it is searched, so
   * a closed loop does not jump from the end back to the start. Without it the whole route is
   * searched.
   */
  readonly hintMetres?: number;
  /** How far behind the hint to look, in metres. Default 30. */
  readonly behindMetres?: number;
  /** How far ahead of the hint to look, in metres. Default 250. */
  readonly aheadMetres?: number;
}

/**
 * Finds the closest point on the route to a position. This is how a real GPS fix becomes a
 * position along the route. It treats each segment as a straight line in a local flat plane.
 */
export function projectOntoRoute(
  index: RouteIndex,
  position: LatLng,
  options: ProjectOptions = {},
): RouteProjection {
  const { path, cumulativeMetres } = index;
  const hint = options.hintMetres;
  const from = hint === undefined ? -Infinity : hint - (options.behindMetres ?? 30);
  const to = hint === undefined ? Infinity : hint + (options.aheadMetres ?? 250);

  let best: RouteProjection | undefined;
  for (let i = 0; i < path.length - 1; i++) {
    const start = cumulativeMetres[i] as number;
    const end = cumulativeMetres[i + 1] as number;
    if (end < from || start > to) continue;
    const a = toLocalMetres(position, path[i] as LatLng);
    const b = toLocalMetres(position, path[i + 1] as LatLng);
    const dx = b.east - a.east;
    const dy = b.north - a.north;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared > 0
        ? Math.min(Math.max(-(a.east * dx + a.north * dy) / lengthSquared, 0), 1)
        : 0;
    const offset = Math.hypot(a.east + dx * t, a.north + dy * t);
    const along = start + t * (end - start);
    if (
      best === undefined ||
      offset < best.offsetMetres - 1e-6 ||
      (Math.abs(offset - best.offsetMetres) <= 1e-6 && along < best.distanceMetres)
    ) {
      best = { distanceMetres: along, offsetMetres: offset };
    }
  }
  if (best === undefined) {
    // The hint was outside the route, so search all of it.
    return projectOntoRoute(index, position);
  }
  return best;
}

/**
 * Works out how far along the route each instruction happens. Instructions are expected in
 * route order, so each one is searched for from the previous one onwards. That keeps the
 * first and last instruction of a closed loop apart, since both sit at the start point.
 */
export function locateInstructions(
  index: RouteIndex,
  instructions: readonly RouteInstruction[],
): number[] {
  const located: number[] = [];
  let previous = 0;
  for (const instruction of instructions) {
    const projection = projectOntoRoute(index, instruction.at);
    let distance = projection.distanceMetres;
    if (distance < previous) {
      // Closest point is behind the last instruction. Look only ahead of it.
      distance = searchAhead(index, instruction.at, previous);
    }
    located.push(distance);
    previous = distance;
  }
  return located;
}

function searchAhead(index: RouteIndex, position: LatLng, fromMetres: number): number {
  const result = projectOntoRoute(index, position, {
    hintMetres: fromMetres,
    behindMetres: 0,
    aheadMetres: Infinity,
  });
  return Math.max(result.distanceMetres, fromMetres);
}
