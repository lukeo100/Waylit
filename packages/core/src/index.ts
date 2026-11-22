export type { GeoPosition, LatLng, PositionFix, SpeedSource, UnitSystem } from "./types";
export type { Manoeuvre, NavigationProgress, Route, RouteInstruction } from "./navigation";
export * from "./units";
export {
  EARTH_RADIUS_METRES,
  bearingDegrees,
  fromLocalMetres,
  haversineDistance,
  interpolateLatLng,
  normaliseDegrees,
  shortestAngleDelta,
  toLocalMetres,
} from "./geo";
export type { LocalMetres } from "./geo";
export { createManualClock, systemClock } from "./clock";
export type { Clock, ManualClock, Scheduler } from "./clock";
export { createRng, gaussian } from "./random";
export type { RandomSource } from "./random";
export { createRouteIndex, locateAlongRoute, pathFromFeature, pathLength } from "./route";
export type { RouteFeature, RouteIndex, RouteLineString, RoutePoint } from "./route";
export { DEMO_ROUTE, DEMO_ROUTE_FEATURE, DEMO_ROUTE_INSTRUCTIONS } from "./demo-route";
export { AlphaBetaFilter, AngleLowPassFilter, LowPassFilter, PositionSmoother } from "./smoothing";
export type { PositionSmootherOptions } from "./smoothing";
export { GpsSimulator } from "./gps-simulator";
export type {
  FixListener,
  GpsNoiseOptions,
  GpsSimulatorOptions,
  GpsSmoothingOptions,
  RideTruth,
  SimulatorState,
} from "./gps-simulator";
export { MediaPlayer } from "./media";
export type {
  MediaArtworkSpec,
  MediaControls,
  MediaListener,
  MediaPlayerOptions,
  MediaState,
  MediaTrack,
  PlaybackStatus,
  ToneSpec,
} from "./media";
export { MOCK_TRACKS } from "./mock-media";
export { artworkDataUri, generateArtworkSvg, svgToDataUri } from "./artwork";
