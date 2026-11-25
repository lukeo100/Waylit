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
 * Ground height of the demo route above mean sea level, in metres. The loop is on flat open
 * ground in Berlin at about 50 m above sea level. A round figure from general knowledge, good
 * to a few metres. It was never read from any tiles.
 */
export const DEMO_ROUTE_GROUND_MSL_METRES = 50;

/**
 * How far the geoid (mean sea level) lies above the WGS84 ellipsoid at Berlin, in metres. The
 * ellipsoid and sea level differ by tens of metres, and Cesium places everything by ellipsoid
 * height, so a camera set from a sea level figure without this would sit that far underground.
 *
 * The figure is 40 m: the earlier value of 45 m was too high, and the review of task 8 put the
 * undulation at Berlin at about 40 m. Quasigeoid heights over Germany run from the high 30s in
 * the north west to about 50 m in the south east (the German quasigeoid and EGM2008 agree to
 * well under a metre there), which brackets 40 m for Berlin, but the sandbox this was written
 * in could not reach the EGM2008 calculators or the BKG quasigeoid documents (the network is
 * blocked), so the number was not looked up against the model itself. Treat it as good to about
 * 5 m. That only shifts how high the camera looks, since it sits several metres above the
 * estimate. If it looks wrong on a device, set `?ground=<metres>` (development builds and
 * `?dev=1`).
 *
 * This is a constant by design. It must never be derived from the Google tiles (Amendment 3).
 */
export const BERLIN_GEOID_UNDULATION_METRES = 40;

/**
 * An estimate of the ground height above the WGS84 ellipsoid along the demo route, in metres:
 * the height above sea level plus the geoid undulation, so 90 m. Not read from any tiles. If
 * the camera looks too high or sinks into the scene, set it for the current run with
 * `?ground=<metres>`.
 */
export const DEMO_ROUTE_GROUND_ELLIPSOID_METRES =
  DEMO_ROUTE_GROUND_MSL_METRES + BERLIN_GEOID_UNDULATION_METRES;
