import { describe, expect, it } from "vitest";
import { getSunTimes } from "@waylit/core";
import {
  DEFAULT_SUN_POSITION,
  computeDaylight,
  localDateString,
  localMinutesOfDay,
  presetInstant,
  roundPosition,
  unknownDaylight,
  withLocalDate,
  withLocalMinutes,
  type TimePreset,
} from "./daylight";

const SOLSTICE = Date.UTC(2026, 5, 21, 12, 0);

describe("computeDaylight", () => {
  it("is full day at solar noon and dark at solar midnight", () => {
    const times = getSunTimes(
      DEFAULT_SUN_POSITION.lat,
      DEFAULT_SUN_POSITION.lng,
      new Date(SOLSTICE),
    );
    const noon = computeDaylight(DEFAULT_SUN_POSITION, times.solarNoon.getTime());
    expect(noon.factor).toBe(1);
    expect(noon.isDay).toBe(true);
    expect(noon.solar.phase).toBe("day");
    const midnight = computeDaylight(DEFAULT_SUN_POSITION, times.solarNoon.getTime() + 12 * 3.6e6);
    expect(midnight.factor).toBe(0);
    expect(midnight.isDay).toBe(false);
    expect(midnight.warmth).toBe(0);
  });

  it("is in between, and warm, at sunrise and sunset", () => {
    const times = getSunTimes(
      DEFAULT_SUN_POSITION.lat,
      DEFAULT_SUN_POSITION.lng,
      new Date(SOLSTICE),
    );
    for (const moment of [times.sunrise, times.sunset]) {
      const state = computeDaylight(DEFAULT_SUN_POSITION, (moment as Date).getTime());
      expect(state.factor).toBeGreaterThan(0.3);
      expect(state.factor).toBeLessThan(0.7);
      expect(state.warmth).toBeGreaterThan(0.8);
    }
  });

  it("changes smoothly through an evening, with no jump", () => {
    let previous = 1;
    for (let minute = 0; minute <= 240; minute += 1) {
      const state = computeDaylight(DEFAULT_SUN_POSITION, SOLSTICE + (6 * 60 + minute) * 60_000);
      expect(previous - state.factor).toBeLessThan(0.05);
      expect(state.factor).toBeLessThanOrEqual(previous + 1e-9);
      previous = state.factor;
    }
  });

  it("does not follow the clock of the day the way the old 07:00 to 19:00 rule did", () => {
    // In June at this place the sun is still well up at 18:30 UTC (20:30 in Berlin), because the
    // sun sets later than 19:00 local, and in December it is down by 16:00 UTC (17:00 local).
    expect(computeDaylight(DEFAULT_SUN_POSITION, Date.UTC(2026, 5, 21, 17, 0)).isDay).toBe(true);
    expect(computeDaylight(DEFAULT_SUN_POSITION, Date.UTC(2026, 11, 21, 16, 0)).isDay).toBe(false);
  });

  it("depends on the position: it is night in Sydney while it is day in Berlin", () => {
    const instant = Date.UTC(2026, 5, 21, 12, 0);
    const sydney = { lat: -33.8688, lng: 151.2093 };
    expect(computeDaylight(DEFAULT_SUN_POSITION, instant).isDay).toBe(true);
    expect(computeDaylight(sydney, instant).isDay).toBe(false);
  });

  it("records whether the time was overridden", () => {
    expect(computeDaylight(DEFAULT_SUN_POSITION, SOLSTICE).overridden).toBe(false);
    expect(computeDaylight(DEFAULT_SUN_POSITION, SOLSTICE, true).overridden).toBe(true);
  });

  it("reports night before the page has a time", () => {
    const state = unknownDaylight(DEFAULT_SUN_POSITION);
    expect(state.factor).toBe(0);
    expect(state.isDay).toBe(false);
    expect(state.solar.phase).toBe("night");
  });
});

describe("time presets", () => {
  const phaseAt = (preset: TimePreset, dayMs: number) =>
    computeDaylight(DEFAULT_SUN_POSITION, presetInstant(preset, DEFAULT_SUN_POSITION, dayMs));

  it("land on dawn, noon, sunset and night at the rider's place", () => {
    for (const dayMs of [SOLSTICE, Date.UTC(2026, 11, 21, 12, 0), Date.UTC(2026, 2, 20, 12, 0)]) {
      const dawn = phaseAt("dawn", dayMs);
      const sunset = phaseAt("sunset", dayMs);
      expect(dawn.solar.rising).toBe(true);
      expect(sunset.solar.rising).toBe(false);
      for (const state of [dawn, sunset]) {
        expect(state.solar.phase).toBe("golden-hour");
        expect(state.factor).toBeGreaterThan(0.4);
        expect(state.factor).toBeLessThan(0.7);
      }
      expect(phaseAt("noon", dayMs).factor).toBe(1);
      expect(phaseAt("night", dayMs).factor).toBe(0);
    }
  });

  it("falls back to six hours either side of noon in polar day and polar night", () => {
    const tromso = { lat: 69.6492, lng: 18.9553 };
    const day = Date.UTC(2026, 5, 21, 12, 0);
    const noon = presetInstant("noon", tromso, day);
    expect(presetInstant("dawn", tromso, day)).toBe(noon - 6 * 3.6e6);
    expect(presetInstant("sunset", tromso, day)).toBe(noon + 6 * 3.6e6);
  });
});

describe("local time helpers", () => {
  it("moves the time of day and the date in the device's own zone, keeping the other part", () => {
    const base = new Date(2026, 5, 21, 14, 35).getTime();
    expect(localMinutesOfDay(base)).toBe(14 * 60 + 35);
    const moved = withLocalMinutes(base, 6 * 60 + 5);
    expect(new Date(moved).getHours()).toBe(6);
    expect(new Date(moved).getMinutes()).toBe(5);
    expect(new Date(moved).getDate()).toBe(21);
    expect(localDateString(base)).toBe("2026-06-21");
    const otherDay = withLocalDate(base, "2026-12-21");
    expect(localDateString(otherDay)).toBe("2026-12-21");
    expect(localMinutesOfDay(otherDay)).toBe(14 * 60 + 35);
    expect(withLocalDate(base, "not a date")).toBe(base);
  });

  it("rounds a position to about 100 metres", () => {
    expect(roundPosition({ lat: 52.47094, lng: 13.40806 })).toEqual({ lat: 52.471, lng: 13.408 });
  });
});
