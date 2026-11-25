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
    // Telemetry comes back reporting a total that includes the gap. The gap itself is already
    // counted from GPS, and the second since the last update is covered from GPS too. After
    // that only new vehicle distance counts.
    const first = step(true, 1);
    expect(first.distanceSource).toBe("vehicle");
    expect(first.distanceMetres).toBeCloseTo(195 + 9.5, 6);
    expect(step(true, 10).distanceMetres).toBeCloseTo(195 + 9.5 + 100, 6);
  });

  describe("stale window", () => {
    // The scooter reports 10 m per second, GPS sees 9.5. The link freezes after the sample at
    // 10 s: the same sample keeps arriving, so it counts as fresh for two seconds and adds
    // nothing, then it goes stale.
    const FROZEN = sample(10_000, 100, 10);

    const rideTo = (trip: TripTracker, startMs: number, endMs: number) => {
      for (let t = startMs; t <= endMs; t += 250) {
        trip.update({
          vehicle: sample(t, (t / 1000) * 10, t / 1000),
          gpsDistanceMetres: (t / 1000) * 9.5,
          rideElapsedSeconds: t / 1000,
          nowMs: t,
        });
      }
    };
    const frozenAt = (trip: TripTracker, nowMs: number) =>
      trip.update({
        vehicle: FROZEN,
        gpsDistanceMetres: (nowMs / 1000) * 9.5,
        rideElapsedSeconds: nowMs / 1000,
        nowMs,
      });

    it("adds nothing while a frozen sample still counts as fresh", () => {
      const trip = new TripTracker();
      rideTo(trip, 0, 10_000);
      const frozen = frozenAt(trip, 11_500);
      expect(frozen.distanceSource).toBe("vehicle");
      expect(frozen.distanceMetres).toBeCloseTo(100, 6);
      expect(frozen.durationSeconds).toBeCloseTo(10, 6);
    });

    it("backfills distance and time from GPS the moment the sample goes stale", () => {
      const trip = new TripTracker();
      rideTo(trip, 0, 10_000);
      frozenAt(trip, 11_500);
      const stale = frozenAt(trip, 12_250);
      expect(stale.distanceSource).toBe("gps");
      expect(stale.distanceFallbackReason).toBe("vehicle-telemetry-stale");
      // 2.25 s of GPS at 9.5 m/s since the last fresh sample, on top of the first 100 m.
      expect(stale.distanceMetres).toBeCloseTo(100 + 2.25 * 9.5, 6);
      expect(stale.durationSeconds).toBeCloseTo(12.25, 6);
      expect(stale.usedGps).toBe(true);
      expect(stale.gpsDistanceMetres).toBeCloseTo(2.25 * 9.5, 6);
    });

    it("keeps counting from GPS after the backfill without a gap or a repeat", () => {
      const trip = new TripTracker();
      rideTo(trip, 0, 10_000);
      for (let t = 10_250; t <= 20_000; t += 250) frozenAt(trip, t);
      const reading = trip.reading;
      expect(reading.distanceMetres).toBeCloseTo(100 + 10 * 9.5, 6);
      expect(reading.durationSeconds).toBeCloseTo(20, 6);
    });

    it("never goes down across the stale window", () => {
      const trip = new TripTracker();
      rideTo(trip, 0, 10_000);
      let previous = trip.reading.distanceMetres;
      let previousTime = trip.reading.durationSeconds;
      for (let t = 10_250; t <= 16_000; t += 250) {
        const reading = frozenAt(trip, t);
        expect(reading.distanceMetres).toBeGreaterThanOrEqual(previous);
        expect(reading.durationSeconds).toBeGreaterThanOrEqual(previousTime);
        previous = reading.distanceMetres;
        previousTime = reading.durationSeconds;
      }
    });

    it("covers the stale window when the link comes back, without counting it twice", () => {
      const trip = new TripTracker();
      rideTo(trip, 0, 10_000);
      for (let t = 10_250; t <= 14_000; t += 250) frozenAt(trip, t);
      // The link returns at 14.25 s with a total that includes the dropout.
      const back = trip.update({
        vehicle: sample(14_250, 142.5, 14.25),
        gpsDistanceMetres: 14.25 * 9.5,
        rideElapsedSeconds: 14.25,
        nowMs: 14_250,
      });
      expect(back.distanceSource).toBe("vehicle");
      expect(back.distanceMetres).toBeCloseTo(100 + 4.25 * 9.5, 6);
      expect(back.durationSeconds).toBeCloseTo(14.25, 6);
      const next = trip.update({
        vehicle: sample(15_250, 152.5, 15.25),
        gpsDistanceMetres: 15.25 * 9.5,
        rideElapsedSeconds: 15.25,
        nowMs: 15_250,
      });
      expect(next.distanceMetres).toBeCloseTo(100 + 4.25 * 9.5 + 10, 6);
    });

    it("does not report GPS use on a trip that never lost the vehicle", () => {
      const trip = new TripTracker();
      rideTo(trip, 0, 20_000);
      expect(trip.reading.usedGps).toBe(false);
      expect(trip.reading.gpsDistanceMetres).toBe(0);
    });

    it("remembers that GPS was used even after the vehicle came back", () => {
      const trip = new TripTracker();
      rideTo(trip, 0, 10_000);
      for (let t = 10_250; t <= 14_000; t += 250) frozenAt(trip, t);
      rideTo(trip, 14_250, 30_000);
      expect(trip.reading.distanceSource).toBe("vehicle");
      expect(trip.reading.usedGps).toBe(true);
      expect(trip.reading.gpsDistanceMetres).toBeGreaterThan(0);
      expect(trip.reading.gpsDistanceMetres).toBeLessThan(trip.reading.distanceMetres);
    });
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
