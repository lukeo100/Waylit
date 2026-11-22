import { describe, expect, it } from "vitest";
import {
  averageSpeedKmh,
  formatDistance,
  formatDuration,
  formatPercent,
  formatRange,
  formatSpeedKmh,
  formatStopwatch,
  formatTripDistance,
} from "./format";

describe("HUD formatting", () => {
  it("shows speed in whole km/h and dashes when unknown", () => {
    expect(formatSpeedKmh(6.4)).toEqual({ value: "23", unit: "km/h" });
    expect(formatSpeedKmh(0)).toEqual({ value: "0", unit: "km/h" });
    expect(formatSpeedKmh(undefined).value).toBe("--");
    expect(formatSpeedKmh(Number.NaN).value).toBe("--");
  });

  it("rounds short distances so digits stay calm", () => {
    expect(formatDistance(3)).toEqual({ value: "5", unit: "m" });
    expect(formatDistance(47)).toEqual({ value: "50", unit: "m" });
    expect(formatDistance(642)).toEqual({ value: "640", unit: "m" });
    expect(formatDistance(994)).toEqual({ value: "990", unit: "m" });
  });

  it("switches to kilometres from about one kilometre", () => {
    expect(formatDistance(995)).toEqual({ value: "1.0", unit: "km" });
    expect(formatDistance(1234)).toEqual({ value: "1.2", unit: "km" });
    expect(formatDistance(4180)).toEqual({ value: "4.2", unit: "km" });
    expect(formatDistance(12_400)).toEqual({ value: "12", unit: "km" });
    expect(formatDistance(undefined).value).toBe("--");
  });

  it("formats trip distance with two decimals", () => {
    expect(formatTripDistance(0)).toEqual({ value: "0.00", unit: "km" });
    expect(formatTripDistance(1236)).toEqual({ value: "1.24", unit: "km" });
    expect(formatTripDistance(15_240)).toEqual({ value: "15.2", unit: "km" });
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(725)).toBe("12 min");
    expect(formatDuration(3900)).toBe("1 h 05 min");
    expect(formatDuration(undefined)).toBe("--");
  });

  it("formats a running trip time", () => {
    expect(formatStopwatch(0)).toBe("00:00");
    expect(formatStopwatch(249.9)).toBe("04:09");
    expect(formatStopwatch(3729)).toBe("1:02:09");
  });

  it("formats battery and range", () => {
    expect(formatPercent(77.6)).toEqual({ value: "78", unit: "%" });
    expect(formatPercent(120).value).toBe("100");
    expect(formatPercent(undefined).value).toBe("--");
    expect(formatRange(41_700)).toEqual({ value: "42", unit: "km" });
  });

  it("works out average speed and survives zero time", () => {
    expect(averageSpeedKmh(5000, 900)).toBeCloseTo(20, 6);
    expect(averageSpeedKmh(5000, 0)).toBe(0);
  });
});
