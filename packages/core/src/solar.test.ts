import { describe, expect, it } from "vitest";
import {
  daylightFactor,
  getSolarState,
  getSunTimes,
  solarPhaseFromElevation,
  type SunTimes,
} from "./solar";

/*
 * Reference values.
 *
 * NOAA's own calculator (https://gml.noaa.gov/grad/solcalc/) was not reachable from the
 * environment where these tests were written, so the numbers below come from an independent
 * source instead: PyEphem 4.2 (the XEphem library, which uses the VSOP87 theory for the sun
 * and no NOAA code). Settings: geocentric sun, observer at sea level, no atmosphere (pressure 0)
 * for positions, and for times the sun's centre crossing -0:50 (sunrise and sunset), -6 degrees
 * (civil) and -12 degrees (nautical), which is the standard definition of each event. The
 * script that produced them is a dozen lines and the observer coordinates are the ones in
 * each case. NOAA's calculator should agree to about a minute, and spot checks against it are
 * welcome. Coordinates are public city centres, rounded.
 *
 * Tolerances: 2 minutes for times, 0.5 degrees for elevation and azimuth.
 */
const TIME_TOLERANCE_MS = 2 * 60_000;
const ANGLE_TOLERANCE_DEGREES = 0.5;

interface TimeCase {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** Any instant on the solar day, in UTC. */
  readonly at: string;
  readonly solarNoon: string;
  readonly sunrise: string | null;
  readonly sunset: string | null;
  readonly civilDawn: string | null;
  readonly civilDusk: string | null;
  readonly nauticalDawn: string | null;
  readonly nauticalDusk: string | null;
}

const TIME_CASES: readonly TimeCase[] = [
  {
    name: "London, June solstice",
    lat: 51.5074,
    lng: -0.1278,
    at: "2026-06-21T12:00:00Z",
    solarNoon: "2026-06-21T12:02:19Z",
    sunrise: "2026-06-21T03:43:05Z",
    sunset: "2026-06-21T20:21:33Z",
    civilDawn: "2026-06-21T02:55:19Z",
    civilDusk: "2026-06-21T21:09:19Z",
    nauticalDawn: "2026-06-21T01:40:40Z",
    nauticalDusk: "2026-06-21T22:23:58Z",
  },
  {
    name: "London, December solstice",
    lat: 51.5074,
    lng: -0.1278,
    at: "2026-12-21T12:00:00Z",
    solarNoon: "2026-12-21T11:58:34Z",
    sunrise: "2026-12-21T08:03:45Z",
    sunset: "2026-12-21T15:53:23Z",
    civilDawn: "2026-12-21T07:23:24Z",
    civilDusk: "2026-12-21T16:33:44Z",
    nauticalDawn: "2026-12-21T06:40:12Z",
    nauticalDusk: "2026-12-21T17:16:56Z",
  },
  {
    name: "Berlin demo area, June solstice",
    lat: 52.47,
    lng: 13.41,
    at: "2026-06-21T12:00:00Z",
    solarNoon: "2026-06-21T11:08:10Z",
    sunrise: "2026-06-21T02:43:22Z",
    sunset: "2026-06-21T19:32:57Z",
    civilDawn: "2026-06-21T01:53:16Z",
    civilDusk: "2026-06-21T20:23:03Z",
    nauticalDawn: "2026-06-21T00:30:19Z",
    nauticalDusk: "2026-06-21T21:45:59Z",
  },
  {
    name: "Berlin demo area, December solstice",
    lat: 52.47,
    lng: 13.41,
    at: "2026-12-21T12:00:00Z",
    solarNoon: "2026-12-21T11:04:24Z",
    sunrise: "2026-12-21T07:14:37Z",
    sunset: "2026-12-21T14:54:11Z",
    civilDawn: "2026-12-21T06:32:59Z",
    civilDusk: "2026-12-21T15:35:48Z",
    nauticalDawn: "2026-12-21T05:48:40Z",
    nauticalDusk: "2026-12-21T16:20:08Z",
  },
  {
    // Southern hemisphere, and a place whose local day starts on the previous UTC date.
    name: "Sydney, June solstice",
    lat: -33.8688,
    lng: 151.2093,
    at: "2026-06-21T12:00:00Z",
    solarNoon: "2026-06-21T01:56:53Z",
    sunrise: "2026-06-20T20:59:57Z",
    sunset: "2026-06-21T06:53:48Z",
    civilDawn: "2026-06-20T20:32:13Z",
    civilDusk: "2026-06-21T07:21:32Z",
    nauticalDawn: "2026-06-20T20:00:58Z",
    nauticalDusk: "2026-06-21T07:52:47Z",
  },
  {
    name: "Sydney, December solstice",
    lat: -33.8688,
    lng: 151.2093,
    at: "2026-12-21T12:00:00Z",
    solarNoon: "2026-12-21T01:53:01Z",
    sunrise: "2026-12-20T18:40:38Z",
    sunset: "2026-12-21T09:05:24Z",
    civilDawn: "2026-12-20T18:11:29Z",
    civilDusk: "2026-12-21T09:34:34Z",
    nauticalDawn: "2026-12-20T17:35:35Z",
    nauticalDusk: "2026-12-21T10:10:28Z",
  },
  {
    name: "Equator on the March equinox",
    lat: 0,
    lng: 0,
    at: "2026-03-20T12:00:00Z",
    solarNoon: "2026-03-20T12:07:26Z",
    sunrise: "2026-03-20T06:04:11Z",
    sunset: "2026-03-20T18:10:41Z",
    civilDawn: "2026-03-20T05:43:31Z",
    civilDusk: "2026-03-20T18:31:20Z",
    nauticalDawn: "2026-03-20T05:19:31Z",
    nauticalDusk: "2026-03-20T18:55:20Z",
  },
  {
    // Western hemisphere, and a dusk that falls on the next UTC date.
    name: "Quito, June solstice",
    lat: -0.1807,
    lng: -78.4678,
    at: "2026-06-21T12:00:00Z",
    solarNoon: "2026-06-21T17:15:44Z",
    sunrise: "2026-06-21T11:12:22Z",
    sunset: "2026-06-21T23:19:06Z",
    civilDawn: "2026-06-21T10:49:50Z",
    civilDusk: "2026-06-21T23:41:38Z",
    nauticalDawn: "2026-06-21T10:23:36Z",
    nauticalDusk: "2026-06-22T00:07:51Z",
  },
  {
    // The sun sets and rises, but never gets 6 degrees down, so there is no civil dawn or dusk.
    // Sunset is just after midnight UTC, on the next date.
    name: "Reykjavik, June solstice (white night)",
    lat: 64.1466,
    lng: -21.9426,
    at: "2026-06-21T12:00:00Z",
    solarNoon: "2026-06-21T13:29:36Z",
    sunrise: "2026-06-21T02:55:12Z",
    sunset: "2026-06-22T00:03:57Z",
    civilDawn: null,
    civilDusk: null,
    nauticalDawn: null,
    nauticalDusk: null,
  },
  {
    // Polar night: the sun stays below the horizon, but gets close enough for civil twilight.
    name: "Tromso, December solstice (polar night)",
    lat: 69.6492,
    lng: 18.9553,
    at: "2026-12-21T12:00:00Z",
    solarNoon: "2026-12-21T10:42:13Z",
    sunrise: null,
    sunset: null,
    civilDawn: "2026-12-21T08:31:15Z",
    civilDusk: "2026-12-21T12:53:09Z",
    nauticalDawn: "2026-12-21T06:46:43Z",
    nauticalDusk: "2026-12-21T14:37:42Z",
  },
  {
    // Polar day: the sun never sets, so no event is defined.
    name: "Tromso, June solstice (midnight sun)",
    lat: 69.6492,
    lng: 18.9553,
    at: "2026-06-21T12:00:00Z",
    solarNoon: "2026-06-21T10:45:59Z",
    sunrise: null,
    sunset: null,
    civilDawn: null,
    civilDusk: null,
    nauticalDawn: null,
    nauticalDusk: null,
  },
];

const FIELDS = [
  "solarNoon",
  "sunrise",
  "sunset",
  "civilDawn",
  "civilDusk",
  "nauticalDawn",
  "nauticalDusk",
] as const satisfies readonly (keyof SunTimes & keyof TimeCase)[];

describe("getSunTimes", () => {
  for (const reference of TIME_CASES) {
    it(`matches the reference times for ${reference.name}`, () => {
      const times = getSunTimes(reference.lat, reference.lng, new Date(reference.at));
      for (const field of FIELDS) {
        const expected = reference[field];
        const actual = times[field];
        if (expected === null) {
          expect(actual, field).toBeNull();
        } else {
          expect(actual, field).not.toBeNull();
          const error = Math.abs((actual as Date).getTime() - Date.parse(expected));
          expect(error, `${field} off by ${(error / 1000).toFixed(0)} s`).toBeLessThanOrEqual(
            TIME_TOLERANCE_MS,
          );
        }
      }
    });
  }

  it("reports polar day, polar night and ordinary days", () => {
    expect(getSunTimes(69.6492, 18.9553, new Date("2026-06-21T12:00:00Z")).polar).toBe("day");
    expect(getSunTimes(69.6492, 18.9553, new Date("2026-12-21T12:00:00Z")).polar).toBe("night");
    expect(getSunTimes(51.5074, -0.1278, new Date("2026-06-21T12:00:00Z")).polar).toBe("none");
    // A white night is not polar day: the sun does set.
    expect(getSunTimes(64.1466, -21.9426, new Date("2026-06-21T12:00:00Z")).polar).toBe("none");
  });

  it("puts events in order across a day", () => {
    const times = getSunTimes(52.47, 13.41, new Date("2026-04-10T09:00:00Z"));
    const order = [
      times.nauticalDawn,
      times.civilDawn,
      times.sunrise,
      times.solarNoon,
      times.sunset,
      times.civilDusk,
      times.nauticalDusk,
    ].map((date) => date?.getTime() ?? Number.NaN);
    expect(order.every(Number.isFinite)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("gives the same answer for any instant inside one solar day", () => {
    const morning = getSunTimes(52.47, 13.41, new Date("2026-06-21T01:00:00Z"));
    const evening = getSunTimes(52.47, 13.41, new Date("2026-06-21T20:00:00Z"));
    expect(evening.sunrise?.getTime()).toBe(morning.sunrise?.getTime());
    expect(evening.sunset?.getTime()).toBe(morning.sunset?.getTime());
  });

  it("moves to the next solar day at local solar midnight, not at UTC midnight", () => {
    // Sydney is about 10 hours east of UTC, so 15:00 UTC on 20 June is already 21 June there.
    const early = getSunTimes(-33.8688, 151.2093, new Date("2026-06-20T15:00:00Z"));
    const late = getSunTimes(-33.8688, 151.2093, new Date("2026-06-21T12:00:00Z"));
    expect(early.sunset?.getTime()).toBe(late.sunset?.getTime());
  });

  it("does not depend on the longitude being written past 180 degrees", () => {
    const a = getSunTimes(10, -170, new Date("2026-03-01T12:00:00Z"));
    const b = getSunTimes(10, 190, new Date("2026-03-01T12:00:00Z"));
    expect(b.sunrise?.getTime()).toBe(a.sunrise?.getTime());
  });

  it("has a defined solar noon and no events at the north pole in midsummer", () => {
    const times = getSunTimes(90, 0, new Date("2026-06-21T12:00:00Z"));
    expect(Number.isFinite(times.solarNoon.getTime())).toBe(true);
    expect(times.sunrise).toBeNull();
    expect(times.polar).toBe("day");
  });

  it("rejects an invalid date or position", () => {
    expect(() => getSunTimes(0, 0, new Date(Number.NaN))).toThrow(RangeError);
    expect(() => getSunTimes(Number.NaN, 0, new Date())).toThrow(RangeError);
    expect(() => getSunTimes(0, Number.POSITIVE_INFINITY, new Date())).toThrow(RangeError);
  });
});

interface PositionCase {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly at: string;
  readonly elevation: number;
  readonly azimuth: number;
  readonly phase: ReturnType<typeof solarPhaseFromElevation>;
}

/** Same source as above: PyEphem 4.2, sun centre, no refraction. */
const POSITION_CASES: readonly PositionCase[] = [
  {
    name: "London, June solstice noon",
    lat: 51.5074,
    lng: -0.1278,
    at: "2026-06-21T12:00:00Z",
    elevation: 61.93,
    azimuth: 178.87,
    phase: "day",
  },
  {
    name: "London, December solstice noon",
    lat: 51.5074,
    lng: -0.1278,
    at: "2026-12-21T12:00:00Z",
    elevation: 15.05,
    azimuth: 180.34,
    phase: "day",
  },
  {
    name: "London, June solstice evening",
    lat: 51.5074,
    lng: -0.1278,
    at: "2026-06-21T18:00:00Z",
    elevation: 18.49,
    azimuth: 284.67,
    phase: "day",
  },
  {
    name: "Sydney, December solstice, sun almost overhead",
    lat: -33.8688,
    lng: 151.2093,
    at: "2026-12-21T02:00:00Z",
    elevation: 79.45,
    azimuth: 351.22,
    phase: "day",
  },
  {
    name: "Equator, equinox sunrise",
    lat: 0,
    lng: 0,
    at: "2026-03-20T06:00:00Z",
    elevation: -1.88,
    azimuth: 90.14,
    phase: "civil-twilight",
  },
  {
    name: "Tromso, midnight sun",
    lat: 69.6492,
    lng: 18.9553,
    at: "2026-06-21T22:00:00Z",
    elevation: 3.45,
    azimuth: 349.42,
    phase: "golden-hour",
  },
  {
    name: "Tromso, polar night around noon",
    lat: 69.6492,
    lng: 18.9553,
    at: "2026-12-21T11:00:00Z",
    elevation: -3.14,
    azimuth: 184.08,
    phase: "civil-twilight",
  },
  {
    name: "Berlin demo area, late November morning",
    lat: 52.47,
    lng: 13.41,
    at: "2026-11-25T09:00:00Z",
    elevation: 12.71,
    azimuth: 152.95,
    phase: "day",
  },
];

describe("getSolarState", () => {
  for (const reference of POSITION_CASES) {
    it(`matches the reference position for ${reference.name}`, () => {
      const state = getSolarState(reference.lat, reference.lng, new Date(reference.at));
      expect(Math.abs(state.elevationDegrees - reference.elevation)).toBeLessThan(
        ANGLE_TOLERANCE_DEGREES,
      );
      // Azimuth is touchy when the sun is nearly overhead, so measure it as an angle on the
      // compass, wrapping at north.
      const azimuthError = Math.abs(((state.azimuthDegrees - reference.azimuth + 540) % 360) - 180);
      expect(azimuthError).toBeLessThan(ANGLE_TOLERANCE_DEGREES);
      expect(state.phase).toBe(reference.phase);
    });
  }

  it("is a pure function of the instant, so the machine time zone cannot matter", () => {
    // The same instant written with different offsets is the same Date.
    const a = getSolarState(52.47, 13.41, new Date("2026-06-21T12:00:00Z"));
    const b = getSolarState(52.47, 13.41, new Date("2026-06-21T14:00:00+02:00"));
    const c = getSolarState(52.47, 13.41, new Date("2026-06-21T07:00:00-05:00"));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("says rising in the morning and falling in the afternoon", () => {
    const morning = getSolarState(52.47, 13.41, new Date("2026-06-21T07:00:00Z"));
    const afternoon = getSolarState(52.47, 13.41, new Date("2026-06-21T15:00:00Z"));
    expect(morning.rising).toBe(true);
    expect(afternoon.rising).toBe(false);
  });

  it("puts the sun due east after sunrise and due west before sunset on an equinox", () => {
    const sunrise = getSolarState(0, 0, new Date("2026-03-20T06:30:00Z"));
    const sunset = getSolarState(0, 0, new Date("2026-03-20T17:45:00Z"));
    expect(Math.abs(sunrise.azimuthDegrees - 90)).toBeLessThan(3);
    expect(Math.abs(sunset.azimuthDegrees - 270)).toBeLessThan(3);
  });

  it("adds refraction near the horizon and almost none overhead", () => {
    const horizon = getSolarState(0, 0, new Date("2026-03-20T06:04:11Z"));
    expect(horizon.apparentElevationDegrees - horizon.elevationDegrees).toBeGreaterThan(0.3);
    const overhead = getSolarState(0, 0, new Date("2026-03-20T12:07:00Z"));
    expect(overhead.apparentElevationDegrees - overhead.elevationDegrees).toBeLessThan(0.01);
  });

  it("reports the sun at the sunrise elevation at the computed sunrise", () => {
    const times = getSunTimes(52.47, 13.41, new Date("2026-09-10T10:00:00Z"));
    const atSunrise = getSolarState(52.47, 13.41, times.sunrise as Date);
    const atCivilDusk = getSolarState(52.47, 13.41, times.civilDusk as Date);
    expect(atSunrise.elevationDegrees).toBeCloseTo(-0.833, 1);
    expect(atCivilDusk.elevationDegrees).toBeCloseTo(-6, 1);
  });

  it("rejects an invalid date", () => {
    expect(() => getSolarState(0, 0, new Date(Number.NaN))).toThrow(RangeError);
  });

  it("stays finite at the poles", () => {
    const north = getSolarState(90, 0, new Date("2026-06-21T12:00:00Z"));
    const south = getSolarState(-90, 0, new Date("2026-06-21T12:00:00Z"));
    for (const value of [north.elevationDegrees, north.azimuthDegrees, south.elevationDegrees]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(north.elevationDegrees).toBeGreaterThan(20);
    expect(south.elevationDegrees).toBeLessThan(-20);
  });
});

describe("solarPhaseFromElevation", () => {
  it("names the phases at their boundaries", () => {
    expect(solarPhaseFromElevation(6)).toBe("day");
    expect(solarPhaseFromElevation(5.99)).toBe("golden-hour");
    expect(solarPhaseFromElevation(-0.833)).toBe("golden-hour");
    expect(solarPhaseFromElevation(-0.84)).toBe("civil-twilight");
    expect(solarPhaseFromElevation(-6)).toBe("civil-twilight");
    expect(solarPhaseFromElevation(-6.01)).toBe("nautical-twilight");
    expect(solarPhaseFromElevation(-12)).toBe("nautical-twilight");
    expect(solarPhaseFromElevation(-12.01)).toBe("night");
    expect(solarPhaseFromElevation(-40)).toBe("night");
  });
});

describe("daylightFactor", () => {
  it("is 0 at and below -6 degrees and 1 at and above +6 degrees", () => {
    expect(daylightFactor(-90)).toBe(0);
    expect(daylightFactor(-6)).toBe(0);
    expect(daylightFactor(6)).toBe(1);
    expect(daylightFactor(90)).toBe(1);
  });

  it("is half way at the horizon and rises smoothly in between", () => {
    expect(daylightFactor(0)).toBeCloseTo(0.5, 6);
    let previous = 0;
    for (let elevation = -6; elevation <= 6; elevation += 0.5) {
      const value = daylightFactor(elevation);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    // No jump larger than a small step anywhere: the curve is continuous.
    expect(daylightFactor(0.1) - daylightFactor(0)).toBeLessThan(0.02);
  });

  it("takes other limits and treats bad input as dark", () => {
    expect(daylightFactor(5, 0, 10)).toBeCloseTo(0.5, 6);
    expect(daylightFactor(Number.NaN)).toBe(0);
    expect(daylightFactor(3, 5, 5)).toBe(0);
    expect(daylightFactor(7, 5, 5)).toBe(1);
  });
});
