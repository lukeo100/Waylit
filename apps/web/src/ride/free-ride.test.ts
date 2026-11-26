import { describe, expect, it } from "vitest";
import {
  LiveGpsSource,
  createManualClock,
  fromLocalMetres,
  type GeolocationErrorLike,
  type GeolocationLike,
  type GeolocationPositionLike,
} from "@waylit/core";
import type { VehicleAdapter, VehicleTelemetry } from "@waylit/vehicle";
import { RideSession } from "./ride-session";
import { createSessionFor } from "./session-factory";

const ORIGIN = { lat: -20, lng: 130 };

class Fake implements GeolocationLike {
  success: ((p: GeolocationPositionLike) => void) | undefined;
  error: ((e: GeolocationErrorLike) => void) | undefined;
  watches = 0;
  watchPosition(
    success: (p: GeolocationPositionLike) => void,
    error: (e: GeolocationErrorLike) => void,
  ): number {
    this.success = success;
    this.error = error;
    this.watches += 1;
    return 1;
  }
  clearWatch(): void {
    this.success = undefined;
  }
  emit(east: number, speed: number | null, accuracy = 6, altitude: number | null = null): void {
    const p = fromLocalMetres(ORIGIN, { east, north: 0 });
    this.success?.({
      coords: {
        latitude: p.lat,
        longitude: p.lng,
        accuracy,
        altitude,
        altitudeAccuracy: altitude === null ? null : 8,
        heading: speed ? 90 : null,
        speed,
      },
      timestamp: 0,
    });
  }
}

function make() {
  const clock = createManualClock(1_700_000_000_000);
  const geo = new Fake();
  const live = new LiveGpsSource({ geolocation: geo, clock });
  const session = new RideSession({ clock, live });
  const ride = (seconds: number, speed = 6) => {
    for (let i = 0; i < seconds; i++) {
      clock.advance(1000);
      geo.emit(i * speed + 100 * Math.floor(clock.now() / 1e12), speed);
      session.tick();
    }
  };
  return { clock, geo, live, session, ride };
}

describe("a free ride on live GPS", () => {
  it("starts idle as a free ride, asks nothing of the browser until the trip starts", () => {
    const { geo, session } = make();
    const s = session.getSnapshot();
    expect(s.freeRide).toBe(true);
    expect(s.phase).toBe("idle");
    expect(geo.watches).toBe(0);
    session.start();
    expect(geo.watches).toBe(1);
  });

  it("has no route progress, next turn or distance left", () => {
    const { session, ride } = make();
    session.start();
    ride(10);
    const s = session.getSnapshot();
    expect(s.progress.nextInstruction).toBeUndefined();
    expect(s.progress.distanceToNextMetres).toBeUndefined();
    expect(s.progress.remainingDistanceMetres).toBe(0);
    expect(s.progress.arrived).toBe(false);
  });

  it("takes speed, position, heading, distance and time from GPS, without an amber fallback", () => {
    const { session, ride } = make();
    session.start();
    ride(30);
    const s = session.getSnapshot();
    expect(s.speed.source).toBe("gps");
    expect(s.speed.fallbackReason).toBeUndefined();
    expect(s.speed.speedMps).toBeCloseTo(6, 0);
    expect(s.position).toBeDefined();
    expect(s.heading).toBeCloseTo(90, 0);
    expect(s.trip.distanceSource).toBe("gps");
    expect(s.trip.distanceMetres).toBeGreaterThan(100);
    expect(s.trip.distanceMetres).toBeLessThan(260);
    expect(s.trip.durationSeconds).toBeGreaterThan(25);
    expect(s.gps?.status).toBe("active");
  });

  it("turns the speed guard on above 8 km/h from the GPS speed", () => {
    const { session, ride } = make();
    session.start();
    ride(20, 6);
    expect(session.getSnapshot().guarded).toBe(true);
  });

  it("reports a weak signal and then a stale one, and recovers", () => {
    const { clock, geo, session, ride } = make();
    session.start();
    ride(5);
    geo.emit(500, 5, 40);
    expect(session.tick().gps?.status).toBe("weak");
    clock.advance(10_000);
    expect(session.tick().gps?.status).toBe("stale");
    geo.emit(520, 5, 5);
    expect(session.tick().gps?.status).toBe("active");
  });

  it("shows denied when permission is refused, and the trip can still be ended", () => {
    const { geo, session } = make();
    session.start();
    geo.error?.({ code: 1 });
    const s = session.tick();
    expect(s.gps?.status).toBe("denied");
    expect(s.position).toBeUndefined();
    const summary = session.endTrip();
    expect(summary?.distanceMetres).toBe(0);
    expect(session.getSnapshot().phase).toBe("summary");
  });

  it("passes the phone's altitude on with its accuracy and the fix time", () => {
    const { clock, geo, session } = make();
    session.start();
    clock.advance(1000);
    geo.emit(0, 5, 6, 123.4);
    const s = session.tick();
    expect(s.altitude).toEqual({ metres: 123.4, accuracyMetres: 8, timestamp: clock.now() });
  });

  it("ends with a GPS summary and goes back to a clean start", () => {
    const { session, ride } = make();
    session.start();
    ride(20);
    const summary = session.endTrip()!;
    expect(summary.distanceSource).toBe("gps");
    expect(summary.averageSpeedKmh).toBeGreaterThan(0);
    session.reset();
    const s = session.getSnapshot();
    expect(s.phase).toBe("idle");
    expect(s.trip.distanceMetres).toBe(0);
    expect(s.freeRide).toBe(true);
  });

  it("keeps no trace in the snapshot", () => {
    const { session, ride } = make();
    session.start();
    ride(10);
    expect(JSON.stringify(session.getSnapshot())).not.toMatch(/trace|history|track/i);
  });
});

describe("a free ride with a vehicle owned by the app", () => {
  function fakeAdapter() {
    const listeners = new Set<(s: VehicleTelemetry) => void>();
    const adapter: VehicleAdapter = {
      info: { adapterId: "fake", displayName: "Fake scooter" },
      capabilities: { fields: ["speedMps"] },
      connect: async () => undefined,
      disconnect: async () => undefined,
      getConnectionState: () => "connected",
      onTelemetry: (l) => {
        listeners.add(l);
        return () => void listeners.delete(l);
      },
      onConnectionStateChange: () => () => undefined,
    };
    const emit = (sample: VehicleTelemetry) => {
      for (const l of listeners) l(sample);
    };
    return { adapter, emit };
  }

  it("uses the scooter speed, and falls back to GPS with a reason when it goes quiet", () => {
    const clock = createManualClock(1_700_000_000_000);
    const geo = new Fake();
    const { adapter, emit } = fakeAdapter();
    const session = new RideSession({
      clock,
      live: new LiveGpsSource({ geolocation: geo, clock }),
      vehicle: adapter,
    });
    session.start();
    for (let i = 0; i < 6; i++) {
      clock.advance(1000);
      geo.emit(i * 5, 5);
      emit({ speedMps: 4, timestamp: clock.now() });
      session.tick();
    }
    let s = session.getSnapshot();
    expect(s.freeRide).toBe(true);
    expect(s.speed.source).toBe("vehicle");
    expect(s.speed.speedMps).toBeCloseTo(4, 5);

    for (let i = 6; i < 10; i++) {
      clock.advance(1000);
      geo.emit(i * 5, 5);
      s = session.tick();
    }
    expect(s.speed.source).toBe("gps");
    expect(s.speed.fallbackReason).toBe("vehicle-telemetry-stale");
  });
});

describe("session factory", () => {
  const timers = { setInterval: () => 1, clearInterval: () => undefined };

  it("makes the simulated ride for sim, a free ride for live and replay", () => {
    expect(createSessionFor("sim", { geolocation: undefined, timers }).getSnapshot().freeRide).toBe(
      false,
    );
    expect(
      createSessionFor("live", { geolocation: new Fake(), timers }).getSnapshot().freeRide,
    ).toBe(true);
    expect(
      createSessionFor("replay", { geolocation: undefined, timers }).getSnapshot().freeRide,
    ).toBe(true);
  });

  it("live without geolocation is unavailable on start, not a crash", () => {
    const session = createSessionFor("live", { geolocation: undefined, timers });
    session.start();
    expect(session.tick().gps?.status).toBe("unavailable");
  });

  it("replay never touches the browser geolocation", () => {
    const geo = new Fake();
    const session = createSessionFor("replay", { geolocation: geo, timers });
    session.start();
    expect(geo.watches).toBe(0);
    expect(session.tick().gps?.status).toBe("requesting");
  });
});
