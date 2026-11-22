/**
 * Demo route for the simulated GPS.
 *
 * Origin and licence: this route is original to Waylit and released under the project
 * licence (Apache 2.0). It was drawn by hand as a closed loop of 14 waypoints, given in
 * metres east and north of an arbitrary reference point, with each corner rounded by a
 * short curve, then converted to WGS84 and rounded to five decimal places (about one
 * metre). It sits in an open, flat, public area of Berlin, Germany, chosen only because it
 * is far from any maintainer or contributor location. It follows no recorded GPS trace,
 * is not surveyed, is not copied from any map, routing service or third party dataset, and
 * may not line up with real paths. Use it for demos and tests only, never for navigation.
 *
 * The geometry is plain GeoJSON, so any tool that reads RFC 7946 can open it. Coordinates
 * are [longitude, latitude].
 */
import type { Route, RouteInstruction } from "./navigation";
import { pathFromFeature, pathLength, type RouteFeature } from "./route";

export const DEMO_ROUTE_FEATURE: RouteFeature = {
  type: "Feature",
  properties: {
    name: "Waylit demo loop",
    description: "Original synthetic loop of about 4.2 km for the simulated GPS.",
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [13.39947, 52.4709],
      [13.40806, 52.4709],
      [13.40814, 52.4709],
      [13.40823, 52.47091],
      [13.4083, 52.47093],
      [13.40838, 52.47095],
      [13.40845, 52.47098],
      [13.40851, 52.47101],
      [13.41035, 52.47213],
      [13.4104, 52.47217],
      [13.41045, 52.47221],
      [13.41049, 52.47226],
      [13.41051, 52.4723],
      [13.41053, 52.47235],
      [13.41053, 52.47241],
      [13.41053, 52.47523],
      [13.41053, 52.47528],
      [13.41051, 52.47533],
      [13.41048, 52.47537],
      [13.41043, 52.4754],
      [13.41037, 52.47544],
      [13.4103, 52.47546],
      [13.40782, 52.47622],
      [13.40775, 52.47624],
      [13.40767, 52.47627],
      [13.4076, 52.4763],
      [13.40754, 52.47634],
      [13.40748, 52.47638],
      [13.40743, 52.47642],
      [13.40553, 52.47796],
      [13.40549, 52.478],
      [13.40545, 52.47804],
      [13.40543, 52.47809],
      [13.40543, 52.47814],
      [13.40544, 52.47819],
      [13.40546, 52.47824],
      [13.40676, 52.48063],
      [13.4068, 52.48068],
      [13.40684, 52.48072],
      [13.40688, 52.48076],
      [13.40694, 52.4808],
      [13.407, 52.48083],
      [13.40708, 52.48086],
      [13.41031, 52.48204],
      [13.41037, 52.48207],
      [13.4104, 52.48209],
      [13.41041, 52.48211],
      [13.41039, 52.48213],
      [13.41035, 52.48214],
      [13.41027, 52.48215],
      [13.40564, 52.48255],
      [13.40555, 52.48256],
      [13.40546, 52.48256],
      [13.40538, 52.48256],
      [13.40529, 52.48255],
      [13.40521, 52.48254],
      [13.40512, 52.48253],
      [13.4012, 52.48173],
      [13.40112, 52.48171],
      [13.40106, 52.48168],
      [13.401, 52.48165],
      [13.40096, 52.48161],
      [13.40093, 52.48157],
      [13.40091, 52.48152],
      [13.40026, 52.47914],
      [13.40025, 52.47909],
      [13.40025, 52.47904],
      [13.40026, 52.47899],
      [13.40029, 52.47894],
      [13.40032, 52.4789],
      [13.40037, 52.47885],
      [13.40226, 52.47732],
      [13.40231, 52.47727],
      [13.40234, 52.47723],
      [13.40234, 52.47719],
      [13.40234, 52.47714],
      [13.40231, 52.4771],
      [13.40226, 52.47706],
      [13.40037, 52.47552],
      [13.40032, 52.47548],
      [13.40028, 52.47543],
      [13.40024, 52.47538],
      [13.40021, 52.47533],
      [13.40019, 52.47528],
      [13.40017, 52.47523],
      [13.39952, 52.47285],
      [13.3995, 52.4728],
      [13.39949, 52.47275],
      [13.39949, 52.47269],
      [13.39948, 52.47264],
      [13.39948, 52.47259],
      [13.39947, 52.47253],
      [13.39947, 52.4709],
    ],
  },
};

/** Hand-written instructions that match the demo geometry. Plain language, no markup. */
export const DEMO_ROUTE_INSTRUCTIONS: readonly RouteInstruction[] = [
  {
    manoeuvre: "depart",
    text: "Head east along the open field",
    at: { lat: 52.4709, lng: 13.39947 },
  },
  { manoeuvre: "slight-left", text: "Bear left", at: { lat: 52.4709, lng: 13.40806 } },
  { manoeuvre: "slight-left", text: "Bear left", at: { lat: 52.47213, lng: 13.41035 } },
  { manoeuvre: "turn-left", text: "Turn left", at: { lat: 52.47523, lng: 13.41053 } },
  { manoeuvre: "slight-right", text: "Bear right", at: { lat: 52.47622, lng: 13.40782 } },
  { manoeuvre: "turn-right", text: "Turn right", at: { lat: 52.47796, lng: 13.40553 } },
  { manoeuvre: "slight-right", text: "Bear right", at: { lat: 52.48063, lng: 13.40676 } },
  { manoeuvre: "turn-left", text: "Turn left", at: { lat: 52.48204, lng: 13.41031 } },
  { manoeuvre: "slight-left", text: "Bear left", at: { lat: 52.48255, lng: 13.40564 } },
  { manoeuvre: "turn-left", text: "Turn left", at: { lat: 52.48173, lng: 13.4012 } },
  { manoeuvre: "slight-left", text: "Bear left", at: { lat: 52.47914, lng: 13.40026 } },
  { manoeuvre: "turn-right", text: "Turn right", at: { lat: 52.47732, lng: 13.40226 } },
  { manoeuvre: "slight-left", text: "Bear left", at: { lat: 52.47552, lng: 13.40037 } },
  {
    manoeuvre: "arrive",
    text: "You have arrived back at the start",
    at: { lat: 52.4709, lng: 13.39947 },
  },
];

const demoPath = pathFromFeature(DEMO_ROUTE_FEATURE);

/** The demo route in the shared `Route` shape used by navigation code. */
export const DEMO_ROUTE: Route = {
  path: demoPath,
  instructions: DEMO_ROUTE_INSTRUCTIONS,
  distanceMetres: pathLength(demoPath),
};
