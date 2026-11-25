/**
 * Sun position, day phase and sun times for any place and moment.
 *
 * The method is the NOAA solar position algorithm, which is a published, public domain
 * procedure from the US National Oceanic and Atmospheric Administration (NOAA) Global
 * Monitoring Laboratory, itself based on Jean Meeus, "Astronomical Algorithms". The code here
 * is an original implementation written from the published equations. It is not copied from
 * SunCalc or any other library. See docs/THIRD_PARTY.md.
 *
 * Everything works in UTC. The functions only ever read `Date.getTime()`, so the answer does
 * not depend on the machine's time zone. They have no DOM, no network and no dependencies.
 *
 * Accuracy: sun elevation and azimuth are good to a few hundredths of a degree for dates within
 * a few centuries of 2000. Sunrise, sunset and twilight times agree with an independent
 * almanac to within about a minute outside the polar circles, and degrade towards the poles
 * where the sun grazes the horizon.
 */
import type { LatLng } from "./types";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
/** Julian day number of the Unix epoch, 1970-01-01T00:00:00Z. */
const UNIX_EPOCH_JULIAN_DAY = 2440587.5;
/** Julian day number of the J2000.0 epoch. */
const J2000_JULIAN_DAY = 2451545;

/**
 * Sun elevation, in degrees, at which the top edge of the sun appears on the horizon. It allows
 * for atmospheric refraction (34 arc minutes) and the sun's apparent radius (16 arc minutes),
 * measured to the centre of the disc: the standard definition of sunrise and sunset.
 */
export const SUNRISE_ELEVATION_DEGREES = -0.833;
/** Sun centre elevation at civil dawn and dusk. */
export const CIVIL_TWILIGHT_ELEVATION_DEGREES = -6;
/** Sun centre elevation at nautical dawn and dusk. */
export const NAUTICAL_TWILIGHT_ELEVATION_DEGREES = -12;
/**
 * Sun elevation below which the sun is "low enough to be golden". This is a photographers'
 * convention, not an astronomical one: the golden hour runs from sunrise or sunset up to
 * (or down from) 6 degrees of elevation.
 */
export const GOLDEN_HOUR_ELEVATION_DEGREES = 6;

/**
 * The part of the day, from the sun's centre elevation.
 *
 * - `day`: 6 degrees or higher
 * - `golden-hour`: from sunrise or sunset (-0.833) up to 6 degrees
 * - `civil-twilight`: -6 up to -0.833
 * - `nautical-twilight`: -12 up to -6
 * - `night`: below -12 (this includes astronomical twilight)
 */
export type SolarPhase = "day" | "golden-hour" | "civil-twilight" | "nautical-twilight" | "night";

export interface SolarState {
  /** Sun centre elevation above the horizon in degrees, without refraction. Negative below it. */
  readonly elevationDegrees: number;
  /** The same elevation corrected for atmospheric refraction, as NOAA's calculator reports it. */
  readonly apparentElevationDegrees: number;
  /** Compass bearing of the sun in degrees clockwise from true north, 0 up to 360. */
  readonly azimuthDegrees: number;
  readonly phase: SolarPhase;
  /** True before local solar noon (the sun is climbing), false after it. */
  readonly rising: boolean;
}

/**
 * Whether the sun stays up or down all day at a place, which is what makes sunrise and sunset
 * undefined: `day` is polar day (the midnight sun), `night` is polar night.
 */
export type PolarCondition = "none" | "day" | "night";

export interface SunTimes {
  /** The moment the sun is highest, which is local solar noon. Always defined. */
  readonly solarNoon: Date;
  /** Sun centre at -0.833 degrees. Null in polar day and polar night. */
  readonly sunrise: Date | null;
  readonly sunset: Date | null;
  /** Sun centre at -6 degrees. Null where the sun never gets that low or never rises above it. */
  readonly civilDawn: Date | null;
  readonly civilDusk: Date | null;
  /** Sun centre at -12 degrees. Null where the sun never gets that low or never rises above it. */
  readonly nauticalDawn: Date | null;
  readonly nauticalDusk: Date | null;
  /** `day` when the sun does not set, `night` when it does not rise, otherwise `none`. */
  readonly polar: PolarCondition;
}

function assertFiniteDate(date: Date): number {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) throw new RangeError("Invalid date");
  return ms;
}

function clampLatitude(lat: number): number {
  if (!Number.isFinite(lat)) throw new RangeError("Latitude must be a finite number");
  return Math.min(90, Math.max(-90, lat));
}

/** Wraps a longitude to -180 up to 180. */
function wrapLongitude(lng: number): number {
  if (!Number.isFinite(lng)) throw new RangeError("Longitude must be a finite number");
  const wrapped = (((lng + 180) % 360) + 360) % 360;
  return wrapped - 180;
}

interface SunCoordinates {
  /** Declination in radians. */
  readonly declination: number;
  /** Equation of time in minutes: apparent solar time minus mean solar time. */
  readonly equationOfTime: number;
}

/** The sun's declination and the equation of time at an instant. */
function sunCoordinates(ms: number): SunCoordinates {
  const julianDay = ms / MS_PER_DAY + UNIX_EPOCH_JULIAN_DAY;
  const t = (julianDay - J2000_JULIAN_DAY) / 36525;

  // Geometric mean longitude and mean anomaly of the sun, in degrees.
  const meanLongitude = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  // Equation of the centre, then the sun's true and apparent longitude.
  const m = meanAnomaly * RAD;
  const centre =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;
  const trueLongitude = meanLongitude + centre;
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude = (trueLongitude - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;

  // Obliquity of the ecliptic, corrected for nutation.
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * RAD;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));

  const y = Math.tan(obliquity / 2) ** 2;
  const l0 = meanLongitude * RAD;
  const equationOfTime =
    4 *
    DEG *
    (y * Math.sin(2 * l0) -
      2 * eccentricity * Math.sin(m) +
      4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * m));

  return { declination, equationOfTime };
}

/** Atmospheric refraction in degrees for a true elevation, using NOAA's piecewise fit. */
function refractionDegrees(elevationDegrees: number): number {
  if (elevationDegrees > 85) return 0;
  const e = elevationDegrees;
  const te = Math.tan(e * RAD);
  let arcSeconds: number;
  if (e > 5) {
    arcSeconds = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  } else if (e > -0.575) {
    arcSeconds = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)));
  } else {
    arcSeconds = -20.772 / te;
  }
  return arcSeconds / 3600;
}

/** Names the phase for a sun centre elevation in degrees. */
export function solarPhaseFromElevation(elevationDegrees: number): SolarPhase {
  if (elevationDegrees >= GOLDEN_HOUR_ELEVATION_DEGREES) return "day";
  if (elevationDegrees >= SUNRISE_ELEVATION_DEGREES) return "golden-hour";
  if (elevationDegrees >= CIVIL_TWILIGHT_ELEVATION_DEGREES) return "civil-twilight";
  if (elevationDegrees >= NAUTICAL_TWILIGHT_ELEVATION_DEGREES) return "nautical-twilight";
  return "night";
}

/**
 * Where the sun is, and what part of the day that makes it, at a place and moment.
 *
 * @param lat Latitude in degrees, north positive.
 * @param lng Longitude in degrees, east positive.
 * @param date The instant. Only its UTC time is used.
 */
export function getSolarState(lat: number, lng: number, date: Date): SolarState {
  const ms = assertFiniteDate(date);
  const latitude = clampLatitude(lat) * RAD;
  const longitude = wrapLongitude(lng);
  const { declination, equationOfTime } = sunCoordinates(ms);

  // True solar time in minutes, then the hour angle (zero at solar noon, positive after it).
  const minutesOfDayUtc = (((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_MINUTE;
  const trueSolarTime = (((minutesOfDayUtc + equationOfTime + 4 * longitude) % 1440) + 1440) % 1440;
  const hourAngleDegrees = trueSolarTime / 4 - 180;
  const hourAngle = hourAngleDegrees * RAD;

  const sinElevation =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const elevationDegrees = Math.asin(Math.min(1, Math.max(-1, sinElevation))) * DEG;

  // Azimuth from the hour angle and declination. Measured from south it is atan2 of these two,
  // so adding 180 degrees gives the bearing from north without any special cases at the poles.
  const fromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
  );
  const azimuthDegrees = (((fromSouth * DEG + 180) % 360) + 360) % 360;

  return {
    elevationDegrees,
    apparentElevationDegrees: elevationDegrees + refractionDegrees(elevationDegrees),
    azimuthDegrees,
    phase: solarPhaseFromElevation(elevationDegrees),
    rising: hourAngleDegrees < 0,
  };
}

/** Same as {@link getSolarState}, taking the position as one object. */
export function getSolarStateAt(position: LatLng, date: Date): SolarState {
  return getSolarState(position.lat, position.lng, date);
}

type EventPair =
  | { readonly kind: "events"; readonly rise: number; readonly set: number }
  /** The sun stays above the elevation all day (for example polar day for sunrise). */
  | { readonly kind: "always-above" }
  /** The sun never reaches the elevation (for example polar night for sunrise). */
  | { readonly kind: "never-above" };

/** Solar noon in milliseconds, from local mean solar noon corrected by the equation of time. */
function solarNoonMs(dayCentreMs: number): number {
  let noon = dayCentreMs;
  for (let i = 0; i < 3; i += 1) {
    noon = dayCentreMs - sunCoordinates(noon).equationOfTime * MS_PER_MINUTE;
  }
  return noon;
}

/**
 * Finds when the sun crosses an elevation going up and coming down around one solar noon. The
 * sun's declination changes a little during the day, so each crossing is refined a few times
 * with the declination at the previous estimate.
 */
function crossings(
  latitude: number,
  dayCentreMs: number,
  noonMs: number,
  elevationDegrees: number,
): EventPair {
  const sinTarget = Math.sin(elevationDegrees * RAD);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);

  const solve = (sign: 1 | -1): number | "always-above" | "never-above" => {
    let t = noonMs;
    for (let i = 0; i < 4; i += 1) {
      const { declination, equationOfTime } = sunCoordinates(t);
      const denominator = cosLat * Math.cos(declination);
      const ratio =
        denominator === 0 ? Number.NaN : (sinTarget - sinLat * Math.sin(declination)) / denominator;
      if (Number.isNaN(ratio))
        return sinTarget < sinLat * Math.sin(declination) ? "always-above" : "never-above";
      if (ratio > 1) return "never-above";
      if (ratio < -1) return "always-above";
      const hourAngleDegrees = Math.acos(ratio) * DEG;
      const noon = dayCentreMs - equationOfTime * MS_PER_MINUTE;
      t = noon + sign * hourAngleDegrees * 4 * MS_PER_MINUTE;
    }
    return t;
  };

  const rise = solve(-1);
  const set = solve(1);
  if (typeof rise === "string") return { kind: rise };
  if (typeof set === "string") return { kind: set };
  return { kind: "events", rise, set };
}

/**
 * Sunrise, sunset, civil and nautical twilight and solar noon for the solar day around a moment
 * at a place.
 *
 * The solar day is the stretch of 24 hours centred on local mean solar noon, which is the same
 * calendar day as the position's longitude would give (so a rider at 150 degrees east asking at
 * 20:00 UTC gets the next day's sun, as they would expect). Times can fall on the neighbouring
 * UTC date, and they are returned as `Date` objects, which are absolute instants.
 *
 * In polar day and polar night there is no sunrise or sunset and the matching fields are null.
 * Near the polar circles the sun may set without ever getting 6 degrees down: then sunrise and
 * sunset are defined and the civil twilight fields are null.
 *
 * @param lat Latitude in degrees, north positive.
 * @param lng Longitude in degrees, east positive.
 * @param date Any instant in the day wanted. Only its UTC time is used.
 */
export function getSunTimes(lat: number, lng: number, date: Date): SunTimes {
  const ms = assertFiniteDate(date);
  const latitude = clampLatitude(lat) * RAD;
  const longitude = wrapLongitude(lng);

  const dayIndex = Math.floor((ms + longitude * 4 * MS_PER_MINUTE) / MS_PER_DAY);
  const dayCentreMs = dayIndex * MS_PER_DAY + MS_PER_DAY / 2 - longitude * 4 * MS_PER_MINUTE;
  const noonMs = solarNoonMs(dayCentreMs);

  const find = (elevation: number): EventPair =>
    crossings(latitude, dayCentreMs, noonMs, elevation);
  const toDate = (value: number): Date => new Date(Math.round(value));

  const sun = find(SUNRISE_ELEVATION_DEGREES);
  const civil = find(CIVIL_TWILIGHT_ELEVATION_DEGREES);
  const nautical = find(NAUTICAL_TWILIGHT_ELEVATION_DEGREES);

  const dates = (pair: EventPair): readonly [Date | null, Date | null] =>
    pair.kind === "events" ? [toDate(pair.rise), toDate(pair.set)] : [null, null];
  const [sunrise, sunset] = dates(sun);
  const [civilDawn, civilDusk] = dates(civil);
  const [nauticalDawn, nauticalDusk] = dates(nautical);

  return {
    solarNoon: toDate(noonMs),
    sunrise,
    sunset,
    civilDawn,
    civilDusk,
    nauticalDawn,
    nauticalDusk,
    polar: sun.kind === "always-above" ? "day" : sun.kind === "never-above" ? "night" : "none",
  };
}

/** Same as {@link getSunTimes}, taking the position as one object. */
export function getSunTimesAt(position: LatLng, date: Date): SunTimes {
  return getSunTimes(position.lat, position.lng, date);
}

/**
 * A smooth daylight factor from 0 (dark) to 1 (full day) for a sun elevation in degrees. It
 * rises along a smoothstep curve from `darkBelowDegrees` up to `lightAboveDegrees`, which
 * default to -6 (the end of civil twilight) and +6 (the top of golden hour). Use it for
 * anything that should fade with the light, such as panel opacity or scene lighting.
 */
export function daylightFactor(
  elevationDegrees: number,
  darkBelowDegrees = CIVIL_TWILIGHT_ELEVATION_DEGREES,
  lightAboveDegrees = GOLDEN_HOUR_ELEVATION_DEGREES,
): number {
  if (!Number.isFinite(elevationDegrees)) return 0;
  const span = lightAboveDegrees - darkBelowDegrees;
  if (span <= 0) return elevationDegrees >= lightAboveDegrees ? 1 : 0;
  const x = Math.min(1, Math.max(0, (elevationDegrees - darkBelowDegrees) / span));
  return x * x * (3 - 2 * x);
}
