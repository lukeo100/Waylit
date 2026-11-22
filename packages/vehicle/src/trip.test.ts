import { describe, expect, it } from "vitest";
import { TripTracker } from "./trip";
import type { VehicleTelemetry } from "./types";

const sample = (
  nowMs: number,
  tripDistanceMetres?: number,
  tripDurationSeconds?: number,
): VehicleTelemetry => ({
  timestamp: nowMs,
  ...(tripDistanceMetres !== undefined ? { tripDistanceMetres } : {}),
  ...(tripDurationSeconds !== undefined ? { tripDurationSeconds } : {}),
});

describe("TripTracker", () => {
  it("uses vehicle distance and duration while telemetry is fresh", () => {
    const trip = new TripTracker();
    trip.update({
      vehicle: sample(0, 0, 0),
      gpsDistanceMetres: 0,
      rideElapsedSeconds: 0,
      nowMs: 0,
    });
    const reading = trip.update({
      vehicle: sample(1000, 52, 10),
      gpsDistanceMetres: 50,
      rideElapsedSeconds: 10,
      nowMs: 1000,
    });
    expect(reading.distanceMetres).toBe(52);
    expect(reading.durationSeconds).toBe(10);
    expect(reading.distanceSource).toBe("vehicle");
    expect(reading.durationSource).toBe("vehicle");
    expect(reading.distanceFallbackReason).toBeUndefined();
  });

  it("falls back to GPS distance when there is no vehicle telemetry", () => {
    const trip = new TripTracker();
    trip.update({ gpsDistanceMetres: 0, rideElapsedSeconds: 0, nowMs: 0 });
    const reading = trip.update({ gpsDistanceMetres: 80, rideElapsedSeconds: 16, nowMs: 16_000 });
    expect(reading.distanceMetres).toBe(80);
    expect(reading.durationSeconds).toBe(16);
    expect(reading.distanceSource).toBe("gps");
    expect(reading.distanceFallbackReason).toBe("no-vehicle-telemetry");
  });

  it("falls back when telemetry has no trip distance", () => {
    const trip = new TripTracker();
    trip.update({ vehicle: sample(0), gpsDistanceMetres: 0, rideElapsedSeconds: 0, nowMs: 0 });
    const reading = trip.update({
      vehicle: sample(1000),
      gpsDistanceMetres: 30,
      rideElapsedSeconds: 6,
      nowMs: 1000,
    });
    expect(reading.distanceMetres).toBe(30);
    expect(reading.distanceFallbackReason).toBe("vehicle-distance-missing");
  });

  it("falls back when telemetry is stale", () => {
    const trip = new TripTracker();
    trip.update({
      vehicle: sample(0, 0, 0),
      gpsDistanceMetres: 0,
      rideElapsedSeconds: 0,
      nowMs: 0,
    });
    const reading = trip.update({
      vehicle: sample(0, 20, 4),
      gpsDistanceMetres: 25,
      rideElapsedSeconds: 5,
      nowMs: 2500,
    });
    expect(reading.distanceSource).toBe("gps");
    expect(reading.distanceFallbackReason).toBe("vehicle-telemetry-stale");
    expect(reading.distanceMetres).toBe(25);
    expect(reading.durationSeconds).toBe(5);
  });

  it("falls back when the vehicle distance is not a sensible number", () => {
    const trip = new TripTracker();
    trip.update({
      vehicle: sample(0, 0, 0),
      gpsDistanceMetres: 0,
      rideElapsedSeconds: 0,
      nowMs: 0,
    });
    const reading = trip.update({
      vehicle: sample(100, Number.NaN, 1),
      gpsDistanceMetres: 5,
      rideElapsedSeconds: 1,
      nowMs: 100,
    });
    expect(reading.distanceFallbackReason).toBe("vehicle-distance-invalid");
    expect(reading.distanceMetres).toBe(5);
  });

  it("carries on through a dropout without jumping, and does not count the gap twice", () => {
    const trip = new TripTracker();
    // 10 m per second on the vehicle's wheel sensor, 9.5 m per second by GPS.
    let nowMs = 0;
    const step = (vehicleOk: boolean, seconds: number) => {
      nowMs += seconds * 1000;
      return trip.update({
        ...(vehicleOk ? { vehicle: sample(nowMs, (nowMs / 1000) * 10, nowMs / 1000) } : {}),
        gpsDistanceMetres: (nowMs / 1000) * 9.5,
        rideElapsedSeconds: nowMs / 1000,
        nowMs,
      });
    };
    trip.update({
      vehicle: sample(0, 0, 0),
      gpsDistanceMetres: 0,
      rideElapsedSeconds: 0,
      nowMs: 0,
    });
    expect(step(true, 10).distanceMetres).toBeCloseTo(100, 6);
    const lost = step(false, 10);
    expect(lost.distanceSource).toBe("gps");
    expect(lost.distanceMetres).toBeCloseTo(100 + 95, 6);
    expect(lost.durationSeconds).toBeCloseTo(20, 6);
    // Telemetry comes back reporting a total that includes the gap. Only new distance counts.
    const first = step(true, 1);
    expect(first.distanceSource).toBe("vehicle");
    expect(first.distanceMetres).toBeCloseTo(195, 6);
    expect(step(true, 10).distanceMetres).toBeCloseTo(295, 6);
  });

  it("never goes down when the vehicle restarts its trip counter", () => {
    const trip = new TripTracker();
    trip.update({
      vehicle: sample(0, 0, 0),
      gpsDistanceMetres: 0,
      rideElapsedSeconds: 0,
      nowMs: 0,
    });
    trip.update({
      vehicle: sample(1000, 100, 10),
      gpsDistanceMetres: 95,
      rideElapsedSeconds: 10,
      nowMs: 1000,
    });
    const after = trip.update({
      vehicle: sample(2000, 5, 1),
      gpsDistanceMetres: 105,
      rideElapsedSeconds: 11,
      nowMs: 2000,
    });
    expect(after.distanceMetres).toBe(100);
  });

  it("starts again from zero after a reset", () => {
    const trip = new TripTracker();
    trip.update({ gpsDistanceMetres: 0, rideElapsedSeconds: 0, nowMs: 0 });
    trip.update({ gpsDistanceMetres: 500, rideElapsedSeconds: 90, nowMs: 90_000 });
    trip.reset();
    expect(trip.reading.distanceMetres).toBe(0);
    // The GPS counter restarts with the trip, so its first reading is new distance.
    const next = trip.update({ gpsDistanceMetres: 10, rideElapsedSeconds: 2, nowMs: 92_000 });
    expect(next.distanceMetres).toBe(10);
    expect(next.durationSeconds).toBe(2);
  });
});
