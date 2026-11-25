import { describe, expect, it } from "vitest";
import { getSolarState, getSunTimes } from "./solar";
import {
  followClockInstant,
  parseSunClockMode,
  sunMoment,
  utcOffsetMinutesAt,
  type SunMomentInput,
} from "./sun-moment";

/** The demo route's start, in Berlin. */
const BERLIN = { lat: 52.4709, lng: 13.3995 };
const TROMSO = { lat: 69.65, lng: 18.96 };

/** The instant at which a device in a zone (minutes east of UTC) reads this wall clock time. */
function deviceInstant(
  [year, month, day]: readonly [number, number, number],
  hour: number,
  minute: number,
  offsetMinutes: number,
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000;
}

const NOV_25: readonly [number, number, number] = [2026, 11, 25];
const MELBOURNE = 11 * 60;
const BERLIN_ZONE = 60;
const NEW_YORK = -5 * 60;

function followClock(deviceNowMs: number, offset: number, position = BERLIN): number {
  return sunMoment({
    mode: "follow-clock",
    positionSource: "simulated",
    deviceNowMs,
    deviceUtcOffsetMinutes: offset,
    position,
  });
}

function sunAt(instant: number, position = BERLIN) {
  return getSolarState(position.lat, position.lng, new Date(instant));
}

describe("follow my clock", () => {
  it("shows night at the Berlin route when the device clock says 22:04 (the owner's test)", () => {
    const device = deviceInstant(NOV_25, 22, 4, MELBOURNE);
    // The real Berlin sun at that moment is high noon, which was the bug.
    expect(sunAt(device).phase).not.toBe("night");
    expect(sunAt(device).elevationDegrees).toBeGreaterThan(5);
    const sun = sunAt(followClock(device, MELBOURNE));
    expect(sun.phase).toBe("night");
    expect(sun.elevationDegrees).toBeLessThan(-12);
  });

  it("shows day at the Berlin route when the device clock says noon", () => {
    const sun = sunAt(followClock(deviceInstant(NOV_25, 12, 0, MELBOURNE), MELBOURNE));
    expect(sun.phase).toBe("day");
    expect(sun.elevationDegrees).toBeGreaterThan(10);
  });

  it("reads 12:00 as solar noon and 00:00 as solar midnight, to the second", () => {
    const noon = followClock(deviceInstant(NOV_25, 12, 0, BERLIN_ZONE), BERLIN_ZONE);
    const solarNoon = getSunTimes(BERLIN.lat, BERLIN.lng, new Date(noon)).solarNoon.getTime();
    expect(Math.abs(noon - solarNoon)).toBeLessThan(1000);
    const midnight = followClock(deviceInstant(NOV_25, 0, 0, BERLIN_ZONE), BERLIN_ZONE);
    // Twelve hours from solar noon the sun is at its lowest.
    expect(sunAt(midnight).elevationDegrees).toBeLessThan(sunAt(noon).elevationDegrees - 30);
    expect(sunAt(midnight).elevationDegrees).toBeLessThan(-30);
  });

  it("gives a sunset around 16:00 on the clock in Berlin in late November", () => {
    const sunsetElevation = (hour: number, minute: number): number =>
      sunAt(followClock(deviceInstant(NOV_25, hour, minute, MELBOURNE), MELBOURNE))
        .elevationDegrees;
    // The sun is on the horizon (the sunrise and sunset elevation is about -0.83) around 16:03.
    expect(Math.abs(sunsetElevation(16, 3) - -0.833)).toBeLessThan(1);
    expect(sunAt(followClock(deviceInstant(NOV_25, 15, 40, MELBOURNE), MELBOURNE)).phase).toBe(
      "golden-hour",
    );
    expect(sunAt(followClock(deviceInstant(NOV_25, 16, 30, MELBOURNE), MELBOURNE)).phase).toBe(
      "civil-twilight",
    );
    expect(sunAt(followClock(deviceInstant(NOV_25, 18, 30, MELBOURNE), MELBOURNE)).phase).toBe(
      "night",
    );
    // The morning mirrors it, with sunrise around 08:00.
    expect(Math.abs(sunsetElevation(7, 57) - -0.833)).toBeLessThan(1);
  });

  it("does not depend on the device's time zone", () => {
    // The same wall clock reading, 22:04 on 25 November, in four different zones.
    const results = [MELBOURNE, BERLIN_ZONE, NEW_YORK, 0, 13 * 60, -12 * 60].map((offset) =>
      followClock(deviceInstant(NOV_25, 22, 4, offset), offset),
    );
    for (const result of results) expect(result).toBe(results[0]);
    // And the sun at the route is the same night sky for all of them.
    expect(sunAt(results[0] ?? 0).phase).toBe("night");
  });

  it("changes with the device's date, so the seasons still show", () => {
    const june = followClock(deviceInstant([2026, 6, 21], 12, 0, BERLIN_ZONE), BERLIN_ZONE);
    const december = followClock(deviceInstant([2026, 12, 21], 12, 0, BERLIN_ZONE), BERLIN_ZONE);
    expect(sunAt(june).elevationDegrees).toBeGreaterThan(55);
    expect(sunAt(december).elevationDegrees).toBeLessThan(16);
  });

  it("keeps the device's date at places near the date line", () => {
    for (const lng of [-179.9, -90, 0, 90, 179.9]) {
      const position = { lat: 10, lng };
      const noon = followClockInstant(deviceInstant(NOV_25, 12, 0, MELBOURNE), MELBOURNE, position);
      const solarNoon = getSunTimes(10, lng, new Date(noon)).solarNoon.getTime();
      expect(Math.abs(noon - solarNoon)).toBeLessThan(1000);
      // The local solar date is the device's date, 25 November, at every longitude.
      const localMeanSolarDay = new Date(noon + lng * 240_000).getUTCDate();
      expect(localMeanSolarDay).toBe(25);
    }
  });

  it("follows the honest sun in polar day and polar night", () => {
    const hours = [0, 6, 12, 18];
    for (const hour of hours) {
      const winter = sunAt(
        followClock(deviceInstant([2026, 12, 21], hour, 0, BERLIN_ZONE), BERLIN_ZONE, TROMSO),
        TROMSO,
      );
      expect(winter.elevationDegrees).toBeLessThan(0);
      const summer = sunAt(
        followClock(deviceInstant([2026, 6, 21], hour, 0, BERLIN_ZONE), BERLIN_ZONE, TROMSO),
        TROMSO,
      );
      expect(summer.elevationDegrees).toBeGreaterThan(0);
    }
  });
});

describe("real sun at the route location", () => {
  it("uses the real instant, whatever the device clock says", () => {
    const device = deviceInstant(NOV_25, 22, 4, MELBOURNE);
    const input: SunMomentInput = {
      mode: "real-sun",
      positionSource: "simulated",
      deviceNowMs: device,
      deviceUtcOffsetMinutes: MELBOURNE,
      position: BERLIN,
    };
    expect(sunMoment(input)).toBe(device);
  });
});

describe("real GPS", () => {
  it("uses the real position and real time with no mapping, in either mode", () => {
    const device = deviceInstant(NOV_25, 22, 4, MELBOURNE);
    for (const mode of ["follow-clock", "real-sun"] as const) {
      expect(
        sunMoment({
          mode,
          positionSource: "gps",
          deviceNowMs: device,
          deviceUtcOffsetMinutes: MELBOURNE,
          position: BERLIN,
        }),
      ).toBe(device);
    }
  });
});

describe("helpers", () => {
  it("reads the mode from an address value", () => {
    expect(parseSunClockMode("clock")).toBe("follow-clock");
    expect(parseSunClockMode("Follow-Clock")).toBe("follow-clock");
    expect(parseSunClockMode("real")).toBe("real-sun");
    expect(parseSunClockMode("real-sun")).toBe("real-sun");
    expect(parseSunClockMode("noon")).toBeUndefined();
    expect(parseSunClockMode(null)).toBeUndefined();
  });

  it("reports the device offset east of UTC, never negative zero", () => {
    expect(Object.is(utcOffsetMinutesAt(Date.UTC(2026, 0, 1)), -0)).toBe(false);
  });
});
