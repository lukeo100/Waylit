import type { LatLng } from "./types";

/** Mean Earth radius in metres (IUGG). */
export const EARTH_RADIUS_METRES = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points in metres, using the haversine formula.
 * Accurate to well under one percent at riding distances, which is enough for HUD values.
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** Wraps an angle in degrees into the range 0 (inclusive) to 360 (exclusive). */
export function normaliseDegrees(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Signed shortest rotation from one heading to another, in degrees from -180 to 180. */
export function shortestAngleDelta(fromDegrees: number, toDegreesValue: number): number {
  const delta = normaliseDegrees(toDegreesValue - fromDegrees);
  return delta > 180 ? delta - 360 : delta;
}

/** Initial great-circle bearing from `a` to `b`, in degrees clockwise from north (0 to 360). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const phi1 = toRadians(a.lat);
  const phi2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return normaliseDegrees(toDegrees(Math.atan2(y, x)));
}

/** Straight-line interpolation between two nearby points. `t` of 0 is `a`, 1 is `b`. */
export function interpolateLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** A point in a local flat plane, in metres east and north of an origin. */
export interface LocalMetres {
  readonly east: number;
  readonly north: number;
}

const METRES_PER_DEGREE_LAT = (Math.PI / 180) * EARTH_RADIUS_METRES;

/**
 * Projects a point into a local east and north plane around `origin`. Uses an
 * equirectangular approximation, accurate to centimetres within a few kilometres.
 */
export function toLocalMetres(origin: LatLng, point: LatLng): LocalMetres {
  const cosLat = Math.cos(toRadians(origin.lat));
  return {
    east: (point.lng - origin.lng) * METRES_PER_DEGREE_LAT * cosLat,
    north: (point.lat - origin.lat) * METRES_PER_DEGREE_LAT,
  };
}

/** Inverse of `toLocalMetres`. */
export function fromLocalMetres(origin: LatLng, local: LocalMetres): LatLng {
  const cosLat = Math.cos(toRadians(origin.lat));
  return {
    lat: origin.lat + local.north / METRES_PER_DEGREE_LAT,
    lng: origin.lng + local.east / (METRES_PER_DEGREE_LAT * cosLat),
  };
}
