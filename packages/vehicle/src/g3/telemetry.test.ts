import { describe, expect, it } from "vitest";
import { writeUintLE } from "./bytes";
import { G3_LIMITS, TelemetryAccumulator, decodeRegister } from "./telemetry";

const le = (value: number, size: number) => writeUintLE(value, size);
/** Two byte little endian two's complement. */
const signed16 = (value: number) => le(value < 0 ? value + 65536 : value, 2);

describe("decodeRegister (fixtures made up for these tests)", () => {
  it("decodes speed from 0.1 km/h units into metres per second", () => {
    const out = decodeRegister("speed", le(180, 2));
    expect(out?.speedMps).toBeCloseTo(5, 6); // 18.0 km/h
    expect(decodeRegister("speed", le(0, 2))?.speedMps).toBe(0);
  });

  it("drops a negative or absurd speed instead of showing it", () => {
    expect(decodeRegister("speed", signed16(-5))).toBeUndefined();
    expect(decodeRegister("speed", le((G3_LIMITS.maxSpeedKmh + 1) * 10, 2))).toBeUndefined();
  });

  it("decodes battery, and drops values above 100 percent", () => {
    expect(decodeRegister("battery", le(87, 2))).toEqual({ batteryPercent: 87 });
    expect(decodeRegister("battery", le(101, 2))).toBeUndefined();
  });

  it("decodes mileage, trip and range", () => {
    expect(decodeRegister("totalMileage", le(1_234_567, 4))).toEqual({ odometerMetres: 1_234_567 });
    expect(decodeRegister("tripMileage", le(321, 2))).toEqual({ tripDistanceMetres: 3210 });
    expect(decodeRegister("range", le(5400, 2))).toEqual({ rangeMetres: 54_000 });
    expect(decodeRegister("range", le(60_000, 2))).toBeUndefined();
  });

  it("decodes temperature with sign and drops out of range values", () => {
    expect(decodeRegister("temperature", le(245, 2))?.temperatureCelsius).toBeCloseTo(24.5, 6);
    expect(decodeRegister("temperature", signed16(-50))?.temperatureCelsius).toBeCloseTo(-5, 6);
    expect(decodeRegister("temperature", le(5000, 2))).toBeUndefined();
  });

  it("shows the riding mode as a number, because the meaning is not documented", () => {
    expect(decodeRegister("gearMode", le(2, 2))).toEqual({ ridingMode: "Mode 2" });
  });

  it("reports error and warning flags as codes, and an empty list when clear", () => {
    expect(decodeRegister("errorCode", le(0, 2))).toEqual({ errorCodes: [] });
    expect(decodeRegister("errorCode", le(0x1a, 2))).toEqual({ errorCodes: ["0x001a"] });
    expect(decodeRegister("warningCode", le(0, 2))).toEqual({ warningCodes: [] });
    expect(decodeRegister("warningCode", le(0x0102, 2))).toEqual({ warningCodes: ["0x0102"] });
  });

  it("returns nothing for a payload that is too short", () => {
    expect(decodeRegister("speed", new Uint8Array(1))).toBeUndefined();
    expect(decodeRegister("totalMileage", new Uint8Array(3))).toBeUndefined();
  });
});

describe("TelemetryAccumulator", () => {
  it("builds one sample from the latest values", () => {
    const acc = new TelemetryAccumulator();
    acc.update("speed", { speedMps: 4 }, 1000);
    acc.update("battery", { batteryPercent: 80 }, 1000);
    expect(acc.sample(1200)).toEqual({ speedMps: 4, batteryPercent: 80, timestamp: 1200 });
  });

  it("leaves speed out once it is older than its limit, so GPS takes over", () => {
    const acc = new TelemetryAccumulator();
    acc.update("speed", { speedMps: 4 }, 1000);
    acc.update("battery", { batteryPercent: 80 }, 1000);
    const later = acc.sample(3000);
    expect(later?.speedMps).toBeUndefined();
    expect(later?.batteryPercent).toBe(80);
    expect(later?.timestamp).toBe(3000);
  });

  it("returns undefined when nothing is current, and after clear", () => {
    const acc = new TelemetryAccumulator();
    expect(acc.sample(0)).toBeUndefined();
    acc.update("speed", { speedMps: 4 }, 0);
    acc.clear();
    expect(acc.sample(10)).toBeUndefined();
    acc.update("speed", { speedMps: 4 }, 0);
    expect(acc.sample(60_000)).toBeUndefined();
  });
});
