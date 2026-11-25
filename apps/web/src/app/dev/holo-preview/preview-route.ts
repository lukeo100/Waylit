import { fromLocalMetres, type LatLng, type Route } from "@waylit/core";
import { DEFAULT_SUN_POSITION } from "@/hud/daylight";

/** Where the preview street starts: the demo start, so the sun is worked out for the same place. */
export const PREVIEW_ORIGIN: LatLng = DEFAULT_SUN_POSITION;

/** Distance along the preview route where the left turn is, in metres. */
export const PREVIEW_TURN_METRES = 182;

/** Length of the preview route, in metres. */
export const PREVIEW_ROUTE_METRES = 330;

/** A route that goes up the main street, turns left at the cross street and carries on. */
export function previewRoute(): Route {
  const at = (east: number, north: number): LatLng =>
    fromLocalMetres(PREVIEW_ORIGIN, { east, north });
  const path = [at(0, -60), at(0, 120), at(-4, 124), at(-9, 126), at(-14, 126), at(-200, 126)];
  const turn = at(0, 122);
  return {
    path,
    distanceMetres: 330,
    instructions: [
      { manoeuvre: "depart", text: "Start", at: path[0] as LatLng },
      { manoeuvre: "turn-left", text: "Turn left", at: turn },
      { manoeuvre: "arrive", text: "Arrive", at: path[path.length - 1] as LatLng },
    ],
  };
}
