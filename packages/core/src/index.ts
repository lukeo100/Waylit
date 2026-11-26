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
export {
  createRouteIndex,
  locateAlongRoute,
  locateInstructions,
  pathFromFeature,
  pathLength,
  projectOntoRoute,
} from "./route";
export type {
  ProjectOptions,
  RouteFeature,
  RouteIndex,
  RouteLineString,
  RoutePoint,
  RouteProjection,
} from "./route";
export { computeProgress, createProgressModel } from "./progress";
export type { ProgressInput, ProgressModel } from "./progress";
export { GpsDistanceIntegrator } from "./gps-distance";
export type { GpsDistanceOptions } from "./gps-distance";
export {
  MISSING_VALUE,
  averageSpeedKmh,
  formatDistance,
  formatDuration,
  formatPercent,
  formatRange,
  formatSpeedKmh,
  formatStopwatch,
  formatTripDistance,
} from "./format";
export type { FormattedValue } from "./format";
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
export {
  CIVIL_TWILIGHT_ELEVATION_DEGREES,
  GOLDEN_HOUR_ELEVATION_DEGREES,
  NAUTICAL_TWILIGHT_ELEVATION_DEGREES,
  SUNRISE_ELEVATION_DEGREES,
  daylightFactor,
  getSolarState,
  getSolarStateAt,
  getSunTimes,
  getSunTimesAt,
  solarPhaseFromElevation,
} from "./solar";
export type { PolarCondition, SolarPhase, SolarState, SunTimes } from "./solar";
export {
  SUN_CLOCK_MODES,
  followClockInstant,
  parseSunClockMode,
  sunMoment,
  utcOffsetMinutesAt,
} from "./sun-moment";
export type { PositionSource, SunClockMode, SunMomentInput } from "./sun-moment";
export {
  DEFAULT_TURN_THRESHOLDS,
  directionOf,
  isSlight,
  nextTurn,
  turnPhase,
} from "./turn-guidance";
export type { TurnDirection, TurnGuidance, TurnPhase, TurnPhaseThresholds } from "./turn-guidance";
export type { GpsStatus, FixSource } from "./position-source";
export { LiveGpsSource, WATCH_OPTIONS } from "./live-gps";
export type {
  GeolocationErrorLike,
  GeolocationLike,
  GeolocationPositionLike,
  GeolocationWatchOptions,
  GpsStatusListener,
  LiveGpsOptions,
} from "./live-gps";
export { REPLAY_CENTRE, createReplayGeolocation, generateReplayTrace } from "./replay-trace";
export type {
  ReplayGeolocationOptions,
  ReplayPoint,
  ReplayTimers,
  ReplayTraceOptions,
} from "./replay-trace";
