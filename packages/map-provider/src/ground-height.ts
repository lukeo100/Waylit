import type { LatLng } from "@waylit/core";

/**
 * Where a provider gets the height of the ground from, when it must place the camera, the
 * rider and later the route markers at a height.
 *
 * In Google mode this is never read from the Google tiles: Google's published guidance treats
 * programmatically reading and recording heights from the 3D imagery as derivative content, so
 * no `sampleHeight`, `clampToHeight`, depth picking or terrain sampling is used against them
 * (see Amendment 3 in the brief). The height comes from a source that has nothing to do with
 * the tiles, such as a constant for the area, route elevation data or an open elevation model.
 * The camera sits several metres above the estimate, so an error of a few metres only changes
 * how high the camera looks.
 */
export interface GroundHeightSource {
  /** Metres above the WGS84 ellipsoid at a position, or undefined when unknown. */
  heightAt(position: LatLng): number | undefined;
}

/** A source that returns one height everywhere. Fine for a flat demo route. */
export function constantGroundHeight(metresAboveEllipsoid: number): GroundHeightSource {
  return { heightAt: () => metresAboveEllipsoid };
}

/**
 * An estimate of the ground height above the WGS84 ellipsoid along the demo route, in metres.
 * The route is on flat open ground in Berlin at about 50 m above mean sea level, and the geoid
 * (mean sea level) lies about 45 m above the ellipsoid there, so about 95 m. It is a round
 * figure from general knowledge, not read from any tiles, and it can be a few metres out. If
 * the camera looks too high or sinks into the scene, set it for the current run with
 * `?ground=<metres>` (development builds and `?dev=1`).
 */
export const DEMO_ROUTE_GROUND_ELLIPSOID_METRES = 95;
