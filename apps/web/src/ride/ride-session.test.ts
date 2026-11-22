import { describe, expect, it } from "vitest";
import { createManualClock, kmhToMps, type Scheduler } from "@waylit/core";
import { GUARD_OFF_KMH, GUARD_ON_KMH, nextGuardState } from "./guard";
import { RideSession, createEmptySnapshot } from "./ride-session";
import { createRideStore } from "./ride-store";

function make(playbackSpeed = 1) {
  const clock = createManualClock(1_700_000_000_000);
  const session = new RideSession({ clock, playbackSpeed });
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.25) {
      clock.advance(250);
      session.tick();
    }
    return session.getSnapshot();
  };
  return { clock, session, run };
}

describe("RideSession", () => {
  it("starts idle with live scooter telemetry and nothing ridden", () => {
    const { session } = make();
    const s = session.getSnapshot();
    expect(s.phase).toBe("idle");
    expect(s.telemetry?.batteryPercent).toBe(100);
    expect(s.trip.distanceMetres).toBe(0);
    expect(s.progress.nextInstruction?.manoeuvre).toBe("depart");
    expect(s.guarded).toBe(false);
  });

  it("rides the route: speed from the scooter, separate from GPS speed", () => {
    const { session, run } = make();
    session.start();
    const s = run(30);
    expect(s.phase).toBe("riding");
    expect(s.speed.source).toBe("vehicle");
    expect(s.telemetry?.speedMps).toBeDefined();
    expect(s.gpsSpeedMps).toBeDefined();
    expect(s.telemetry?.speedMps).not.toBe(s.gpsSpeedMps);
    expect(s.position).toBeDefined();
    expect(s.heading).toBeDefined();
  });

  it("counts down the route and the next turn", () => {
    const { session, run } = make();
    session.start();
    const early = run(10);
    const later = run(30);
    expect(later.progress.distanceAlongMetres).toBeGreaterThan(early.progress.distanceAlongMetres);
    expect(later.progress.remainingDistanceMetres).toBeLessThan(
      early.progress.remainingDistanceMetres,
    );
    expect(early.progress.nextInstruction?.manoeuvre).toBe("slight-left");
    expect(later.progress.distanceToNextMetres!).toBeLessThan(early.progress.distanceToNextMetres!);
    expect(later.progress.etaTimestamp).toBeGreaterThan(1_700_000_000_000);
  });

  it("trip distance follows the ride and stays near GPS distance", () => {
    const { session, run } = make();
    session.start();
    const s = run(60);
    expect(s.trip.distanceSource).toBe("vehicle");
    expect(s.trip.distanceMetres).toBeGreaterThan(200);
    expect(Math.abs(s.trip.distanceMetres - s.progress.distanceAlongMetres)).toBeLessThan(
      s.progress.distanceAlongMetres * 0.1 + 15,
    );
  });

  it("falls back to GPS for speed and trip distance when telemetry is lost", () => {
    const { session, run } = make();
    session.start();
    run(20);
    const before = session.getSnapshot().trip.distanceMetres;
    session.setTelemetryLost(true);
    const s = run(10);
    expect(s.telemetryLost).toBe(true);
    expect(s.telemetry).toBeUndefined();
    expect(s.speed.source).toBe("gps");
    expect(s.speed.fallbackReason).toBe("vehicle-telemetry-stale");
    expect(s.trip.distanceSource).toBe("gps");
    expect(s.trip.distanceMetres).toBeGreaterThan(before + 20);
    // Telemetry returns and the trip carries on without going back.
    session.setTelemetryLost(false);
    const back = run(5);
    expect(back.speed.source).toBe("vehicle");
    expect(back.trip.distanceSource).toBe("vehicle");
    expect(back.trip.distanceMetres).toBeGreaterThanOrEqual(s.trip.distanceMetres);
  });

  it("turns the speed guard on and off with a gap, and off outside a trip", () => {
    const { session, run } = make();
    expect(session.getSnapshot().guarded).toBe(false);
    session.start();
    expect(run(1).guarded).toBe(false);
    expect(run(25).guarded).toBe(true);
    session.endTrip();
    expect(session.getSnapshot().guarded).toBe(false);
  });

  it("changes playback speed", () => {
    const slow = make(1);
    const fast = make(1);
    slow.session.start();
    fast.session.start();
    fast.session.setPlaybackSpeed(8);
    const a = slow.run(20);
    const b = fast.run(20);
    expect(b.playbackSpeed).toBe(8);
    expect(b.progress.distanceAlongMetres).toBeGreaterThan(a.progress.distanceAlongMetres * 4);
    fast.session.setPlaybackSpeed(-1);
    expect(fast.session.getSnapshot().playbackSpeed).toBe(8);
  });

  it("ends the trip with a summary and freezes", () => {
    const { clock, session, run } = make();
    session.start();
    run(40);
    const summary = session.endTrip();
    expect(summary).toBeDefined();
    expect(summary!.distanceMetres).toBeGreaterThan(100);
    expect(summary!.durationSeconds).toBeGreaterThan(30);
    expect(summary!.averageSpeedKmh).toBeGreaterThan(5);
    expect(summary!.averageSpeedKmh).toBeLessThan(30);
    const frozen = session.getSnapshot();
    expect(frozen.phase).toBe("summary");
    expect(frozen.summary).toBe(summary);
    clock.advance(10_000);
    expect(session.tick()).toBe(frozen);
    expect(session.endTrip()).toBeUndefined();
  });

  it("ignores start while riding and End trip before a trip", () => {
    const { session } = make();
    expect(session.endTrip()).toBeUndefined();
    session.start();
    session.start();
    expect(session.getSnapshot().phase).toBe("riding");
  });

  it("returns to a fresh start state, keeping dev settings", () => {
    const { session, run } = make();
    session.setPlaybackSpeed(4);
    session.start();
    run(30);
    session.endTrip();
    session.reset();
    const s = session.getSnapshot();
    expect(s.phase).toBe("idle");
    expect(s.summary).toBeUndefined();
    expect(s.trip.distanceMetres).toBe(0);
    expect(s.progress.distanceAlongMetres).toBe(0);
    expect(s.playbackSpeed).toBe(4);
    expect(s.telemetry?.batteryPercent).toBe(100);
    session.start();
    expect(session.getSnapshot().phase).toBe("riding");
  });

  it("reaches the end of the route and reports arrival", () => {
    const { session, run } = make(8);
    session.start();
    const s = run(700);
    expect(s.progress.arrived).toBe(true);
    expect(s.progress.nextInstruction?.manoeuvre).toBe("arrive");
    expect(s.progress.remainingDistanceMetres).toBe(0);
    expect(s.speed.speedMps ?? 0).toBeLessThan(kmhToMps(2));
  });
});

describe("speed guard", () => {
  it("switches on at the on speed and off below the off speed", () => {
    expect(nextGuardState(false, GUARD_ON_KMH - 0.1)).toBe(false);
    expect(nextGuardState(false, GUARD_ON_KMH)).toBe(true);
    expect(nextGuardState(true, GUARD_OFF_KMH + 0.1)).toBe(true);
    expect(nextGuardState(true, GUARD_OFF_KMH - 0.1)).toBe(false);
  });

  it("keeps its state when the speed is unknown", () => {
    expect(nextGuardState(true, undefined)).toBe(true);
    expect(nextGuardState(false, Number.NaN)).toBe(false);
  });
});

describe("ride store", () => {
  function fakeScheduler() {
    const timers = new Map<number, () => void>();
    let next = 1;
    const scheduler: Scheduler = {
      setInterval: (callback) => {
        timers.set(next, callback);
        return next++;
      },
      clearInterval: (handle) => {
        timers.delete(handle as number);
      },
    };
    return { scheduler, timers, fire: () => timers.forEach((cb) => cb()) };
  }

  it("runs the timer only while something is subscribed", () => {
    const { clock, session } = make();
    const { scheduler, timers, fire } = fakeScheduler();
    const store = createRideStore(session, scheduler);
    expect(timers.size).toBe(0);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls++;
    });
    expect(timers.size).toBe(1);
    clock.advance(1000);
    const before = store.getSnapshot();
    fire();
    expect(calls).toBe(1);
    expect(store.getSnapshot()).not.toBe(before);
    unsubscribe();
    expect(timers.size).toBe(0);
  });

  it("tells subscribers after actions and keeps the server snapshot fixed", () => {
    const { session } = make();
    const { scheduler } = fakeScheduler();
    const store = createRideStore(session, scheduler);
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.start();
    expect(store.getSnapshot().phase).toBe("riding");
    store.endTrip();
    expect(store.getSnapshot().phase).toBe("summary");
    store.reset();
    expect(store.getSnapshot().phase).toBe("idle");
    expect(calls).toBe(3);
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());
    expect(store.getServerSnapshot()).toEqual(createEmptySnapshot());
  });
});
