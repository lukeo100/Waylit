import { describe, expect, it } from "vitest";
import type { PositionFix } from "@waylit/core";
import { selectSpeed } from "./speed-selection";
import type { VehicleTelemetry } from "./types";

const now = 100_000;
const fresh: VehicleTelemetry = { speedMps: 5, timestamp: now - 200 };
const gps: PositionFix = { position: { lat: 0, lng: 0 }, speedMps: 4.6, timestamp: now - 500 };

describe("selectSpeed", () => {
  it("uses fresh vehicle speed and keeps it apart from GPS speed", () => {
    expect(selectSpeed({ vehicle: fresh, gps, nowMs: now })).toEqual({
      speedMps: 5,
      source: "vehicle",
    });
  });

  it("falls back to GPS when there is no vehicle telemetry", () => {
    expect(selectSpeed({ gps, nowMs: now })).toEqual({
      speedMps: 4.6,
      source: "gps",
      fallbackReason: "no-vehicle-telemetry",
    });
  });

  it("falls back to GPS when telemetry has no speed field", () => {
    const result = selectSpeed({
      vehicle: { timestamp: now, batteryPercent: 80 },
      gps,
      nowMs: now,
    });
    expect(result.source).toBe("gps");
    expect(result.fallbackReason).toBe("vehicle-speed-missing");
  });

  it("falls back to GPS when telemetry is stale", () => {
    const stale = { speedMps: 5, timestamp: now - 2500 };
    const result = selectSpeed({ vehicle: stale, gps, nowMs: now });
    expect(result.source).toBe("gps");
    expect(result.fallbackReason).toBe("vehicle-telemetry-stale");
  });

  it("treats telemetry exactly at the limit as fresh", () => {
    const edge = { speedMps: 5, timestamp: now - 2000 };
    expect(selectSpeed({ vehicle: edge, gps, nowMs: now }).source).toBe("vehicle");
  });

  it("respects a custom stale limit", () => {
    const old = { speedMps: 5, timestamp: now - 4000 };
    expect(selectSpeed({ vehicle: old, gps, nowMs: now, staleAfterMs: 5000 }).source).toBe(
      "vehicle",
    );
  });

  it("rejects negative and non-finite vehicle speeds", () => {
    for (const speedMps of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = selectSpeed({ vehicle: { speedMps, timestamp: now }, gps, nowMs: now });
      expect(result.source).toBe("gps");
      expect(result.fallbackReason).toBe("vehicle-speed-invalid");
    }
  });

  it("reports nothing when neither source is usable", () => {
    const result = selectSpeed({ vehicle: { speedMps: 5, timestamp: now - 9000 }, nowMs: now });
    expect(result.speedMps).toBeUndefined();
    expect(result.source).toBeUndefined();
    expect(result.fallbackReason).toBe("vehicle-telemetry-stale");
  });

  it("ignores stale GPS", () => {
    const oldGps = { ...gps, timestamp: now - 20_000 };
    expect(selectSpeed({ gps: oldGps, nowMs: now }).source).toBeUndefined();
  });

  it("ignores a GPS fix with no speed", () => {
    const noSpeed: PositionFix = { position: gps.position, timestamp: gps.timestamp };
    expect(selectSpeed({ gps: noSpeed, nowMs: now }).speedMps).toBeUndefined();
  });

  it("uses zero speed from the vehicle as a real value", () => {
    expect(selectSpeed({ vehicle: { speedMps: 0, timestamp: now }, gps, nowMs: now })).toEqual({
      speedMps: 0,
      source: "vehicle",
    });
  });
});
