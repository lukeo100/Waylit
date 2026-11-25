/**
 * Camera maths for MapLibre, whose camera is a centre, a zoom, a bearing and a pitch measured
 * from straight down, not a distance from a point. Pure functions, so they can be tested.
 */

const EARTH_CIRCUMFERENCE_METRES = 2 * Math.PI * 6_371_008.8;
const TILE_SIZE = 512;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * The map zoom that puts the camera `rangeMetres` from the point it looks at, for a screen
 * `heightPixels` tall (in CSS pixels) and a vertical field of view, at a latitude.
 *
 * MapLibre puts the camera `0.5 / tan(fov / 2)` screen heights from the centre, measured in
 * pixels on the ground at the centre, and a pixel at zoom `z` is
 * `circumference * cos(latitude) / (512 * 2^z)` metres wide.
 */
export function zoomForRange(
  rangeMetres: number,
  latitudeDegrees: number,
  heightPixels: number,
  verticalFovDegrees: number,
): number {
  const cameraToCenterPixels = (0.5 * heightPixels) / Math.tan(toRadians(verticalFovDegrees / 2));
  const metresAtZoomZero =
    (EARTH_CIRCUMFERENCE_METRES * Math.cos(toRadians(latitudeDegrees))) / TILE_SIZE;
  const zoom = Math.log2((cameraToCenterPixels * metresAtZoomZero) / Math.max(rangeMetres, 0.1));
  return Math.min(22, Math.max(0, zoom));
}

/** MapLibre measures pitch from straight down. Our pose measures it below the horizon. */
export function mapPitchFromDepression(depressionDegrees: number): number {
  return Math.min(85, Math.max(0, 90 - depressionDegrees));
}
