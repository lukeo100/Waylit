import { bearingDegrees, haversineDistance, interpolateLatLng } from "./geo";
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
