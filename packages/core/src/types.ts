/** A WGS84 position in decimal degrees. */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** A position with optional altitude and accuracy, as produced by a GPS source. */
export interface GeoPosition extends LatLng {
  /** Metres above the WGS84 ellipsoid, when known. */
  readonly altitude?: number;
  /** Horizontal accuracy radius in metres, when known. */
  readonly accuracy?: number;
}

/** A single position fix from any source (simulated, browser GPS, native GPS). */
export interface PositionFix {
  readonly position: GeoPosition;
  /** Heading in degrees clockwise from true north, 0 to 360, when known. */
  readonly heading?: number;
  /** Speed over ground in metres per second, derived from GPS. */
  readonly speedMps?: number;
  /** Milliseconds since the Unix epoch. */
  readonly timestamp: number;
}

/** Where a speed value came from. GPS speed and vehicle speed are kept separate. */
export type SpeedSource = "gps" | "vehicle";

/** Display preference for distances and speeds. */
export type UnitSystem = "metric" | "imperial";
