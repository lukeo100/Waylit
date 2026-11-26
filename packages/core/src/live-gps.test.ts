import { describe, expect, it } from "vitest";
import { createManualClock } from "./clock";
import { haversineDistance, fromLocalMetres } from "./geo";
import {
  LiveGpsSource,
  WATCH_OPTIONS,
  type GeolocationErrorLike,
  type GeolocationLike,
  type GeolocationPositionLike,
} from "./live-gps";
import type { GpsStatus } from "./position-source";

const ORIGIN = { lat: 10, lng: 20 };

class FakeGeolocation implements GeolocationLike {
  success: ((p: GeolocationPositionLike) => void) | undefined;
  error: ((e: GeolocationErrorLike) => void) | undefined;
  options: unknown;
  watching = 0;
  cleared: number[] = [];
  watchPosition(
    success: (p: GeolocationPositionLike) => void,
    error: (e: GeolocationErrorLike) => void,
    options: unknown,
  ): number {
    this.success = success;
    this.error = error;
    this.options = options;
    this.watching += 1;
    return 42;
  }
  clearWatch(id: number): void {
    this.cleared.push(id);
    this.success = undefined;
  }
  emit(p: Partial<GeolocationPositionLike["coords"]> & { east?: number; north?: number }): void {
    const here = fromLocalMetres(ORIGIN, { east: p.east ?? 0, north: p.north ?? 0 });
    this.success?.({
      coords: {
        latitude: p.latitude ?? here.lat,
        longitude: p.longitude ?? here.lng,
        accuracy: p.accuracy ?? 5,
        altitude: p.altitude ?? null,
        altitudeAccuracy: p.altitudeAccuracy ?? null,
        heading: p.heading ?? null,
        speed: p.speed ?? null,
      },
      timestamp: 0,
    });
  }
}

function setup(options: Partial<ConstructorParameters<typeof LiveGpsSource>[0]> = {}) {
  const clock = createManualClock(1_000_000);
  const geo = new FakeGeolocation();
  const source = new LiveGpsSource({ geolocation: geo, clock, ...options });
  const statuses: GpsStatus[] = [];
  source.onStatus((s) => statuses.push(s));
  return { clock, geo, source, statuses };
}

describe("starting and stopping", () => {
  it("starts idle, asks the browser for high accuracy and says it is requesting", () => {
    const { geo, source, statuses } = setup();
    expect(source.status).toBe("idle");
    source.start();
    expect(source.status).toBe("requesting");
    expect(geo.options).toEqual(WATCH_OPTIONS);
    expect(WATCH_OPTIONS.enableHighAccuracy).toBe(true);
    expect(statuses).toEqual(["requesting"]);
  });

  it("watches once however many times start is called, and stop clears the watch", () => {
    const { geo, source } = setup();
    source.start();
    source.start();
    expect(geo.watching).toBe(1);
    source.stop();
    expect(geo.cleared).toEqual([42]);
    expect(source.status).toBe("idle");
    expect(source.getLastFix()).toBeUndefined();
  });

  it("is unavailable when the browser has no geolocation", () => {
    const source = new LiveGpsSource({ geolocation: undefined, clock: createManualClock(0) });
    source.start();
    expect(source.status).toBe("unavailable");
  });

  it("is unavailable when asking throws", () => {
    const source = new LiveGpsSource({
      geolocation: {
        watchPosition() {
          throw new Error("blocked by policy");
        },
        clearWatch() {},
      },
      clock: createManualClock(0),
    });
    source.start();
    expect(source.status).toBe("unavailable");
  });
});

describe("states", () => {
  it("goes active on a good fix", () => {
    const { geo, source } = setup();
    source.start();
    geo.emit({ accuracy: 6 });
    expect(source.status).toBe("active");
    expect(source.getLastFix()?.position.accuracy).toBe(6);
  });

  it("goes weak on a poor but usable fix, and back to active", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ accuracy: 40 });
    expect(source.status).toBe("weak");
    expect(source.getLastFix()).toBeDefined();
    clock.advance(1000);
    geo.emit({ accuracy: 8 });
    expect(source.status).toBe("active");
  });

  it("is denied on a permission error, stops watching and keeps no fix", () => {
    const { geo, source } = setup();
    source.start();
    geo.error?.({ code: 1 });
    expect(source.status).toBe("denied");
    expect(geo.cleared).toEqual([42]);
  });

  it("is unavailable when no position can be found at all, and weak on a first timeout", () => {
    const a = setup();
    a.source.start();
    a.geo.error?.({ code: 2 });
    expect(a.source.status).toBe("unavailable");
    const b = setup();
    b.source.start();
    b.geo.error?.({ code: 3 });
    expect(b.source.status).toBe("weak");
  });

  it("leaves the state to the stale check when an error comes after a fix", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({});
    geo.error?.({ code: 3 });
    expect(source.status).toBe("active");
    clock.advance(9000);
    source.update();
    expect(source.status).toBe("stale");
  });

  it("goes stale when fixes stop, and recovers when they return", () => {
    const { clock, geo, source, statuses } = setup();
    source.start();
    geo.emit({});
    clock.advance(7000);
    source.update();
    expect(source.status).toBe("active");
    clock.advance(1500);
    source.update();
    expect(source.status).toBe("stale");
    expect(source.getMotion().speedMps).toBe(0);
    geo.emit({});
    expect(source.status).toBe("active");
    expect(statuses).toEqual(["requesting", "active", "stale", "active"]);
  });

  it("does not report stale before any fix arrived", () => {
    const { clock, source } = setup();
    source.start();
    clock.advance(60_000);
    source.update();
    expect(source.status).toBe("requesting");
  });
});

describe("accuracy gating", () => {
  it("drops fixes worse than the limit and says weak", () => {
    const { geo, source } = setup();
    source.start();
    geo.emit({ accuracy: 80 });
    expect(source.getLastFix()).toBeUndefined();
    expect(source.droppedCount).toBe(1);
    expect(source.status).toBe("weak");
    expect(source.accuracyMetres).toBe(80);
  });

  it("keeps the last good fix while a bad one is dropped, and counts the report as alive", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ east: 0, accuracy: 5 });
    const good = source.getLastFix();
    clock.advance(5000);
    geo.emit({ east: 500, accuracy: 90 });
    expect(source.getLastFix()).toBe(good);
    clock.advance(5000);
    source.update();
    // The receiver keeps reporting, so it is weak and not stale.
    expect(source.status).toBe("weak");
  });

  it("honours custom limits", () => {
    const { geo, source } = setup({ maxAccuracyMetres: 10, goodAccuracyMetres: 5 });
    source.start();
    geo.emit({ accuracy: 8 });
    expect(source.status).toBe("weak");
    geo.emit({ accuracy: 12 });
    expect(source.droppedCount).toBe(1);
  });

  it("drops impossible numbers", () => {
    const { geo, source } = setup();
    source.start();
    geo.emit({ latitude: Number.NaN });
    geo.emit({ latitude: 95 });
    geo.emit({ longitude: 200 });
    expect(source.getLastFix()).toBeUndefined();
    expect(source.droppedCount).toBe(3);
  });
});

describe("speed", () => {
  it("uses the reported speed, smoothed", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ speed: 5 });
    clock.advance(1000);
    geo.emit({ speed: 5 });
    expect(source.getLastFix()?.speedMps).toBeCloseTo(5, 6);
    clock.advance(1000);
    geo.emit({ speed: 9 });
    const smoothed = source.getLastFix()!.speedMps!;
    expect(smoothed).toBeGreaterThan(5);
    expect(smoothed).toBeLessThan(9);
  });

  it("works speed out from distance over time when the browser gives none", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ east: 0 });
    clock.advance(1000);
    geo.emit({ east: 6 });
    clock.advance(1000);
    geo.emit({ east: 12 });
    expect(source.getLastFix()?.speedMps).toBeGreaterThan(2);
    expect(source.getLastFix()?.speedMps).toBeLessThan(8);
  });

  it("treats a tiny speed as standing still, and a glitch as capped", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ speed: 0.2 });
    expect(source.getLastFix()?.speedMps).toBe(0);
    clock.advance(1000);
    geo.emit({ speed: 500 });
    expect(source.getLastFix()!.speedMps!).toBeLessThanOrEqual(40);
  });

  it("ignores a negative or non-finite reported speed and falls back to distance", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ east: 0 });
    clock.advance(1000);
    geo.emit({ east: 5, speed: -3 });
    expect(source.getLastFix()!.speedMps!).toBeGreaterThanOrEqual(0);
    expect(source.getMotion().speedMps).toBe(source.getLastFix()!.speedMps);
  });
});

describe("heading", () => {
  it("has no heading until the rider is moving", () => {
    const { geo, source } = setup();
    source.start();
    geo.emit({ speed: 0, heading: 90 });
    expect(source.getLastFix()?.heading).toBeUndefined();
  });

  it("takes the reported heading above the speed threshold, smoothed through north", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ speed: 5, heading: 350 });
    expect(source.getLastFix()?.heading).toBeCloseTo(350, 6);
    clock.advance(1000);
    geo.emit({ speed: 5, heading: 10 });
    const h = source.getLastFix()!.heading!;
    // It turned the short way, through north, and not through the south.
    expect(h > 350 || h < 10).toBe(true);
  });

  it("holds the last heading once the rider has slowed below the threshold", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ speed: 5, heading: 120 });
    // Slow right down. The speed smoothing takes a few seconds to get under the threshold.
    for (let i = 0; i < 10; i++) {
      clock.advance(1000);
      geo.emit({ speed: 0, heading: 120 });
    }
    expect(source.getLastFix()?.speedMps).toBe(0);
    const held = source.getLastFix()!.heading;
    expect(held).toBeCloseTo(120, 6);
    // A phone's compass wanders while parked. The heading does not follow it.
    for (const wander of [300, 10, 200]) {
      clock.advance(1000);
      geo.emit({ speed: 0, heading: wander });
      expect(source.getLastFix()?.heading).toBe(held);
    }
  });

  it("takes the direction of travel when the browser gives no heading", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ east: 0, north: 0, speed: 5 });
    clock.advance(1000);
    geo.emit({ east: 0, north: 6, speed: 5 });
    expect(
      Math.min(source.getLastFix()!.heading!, 360 - source.getLastFix()!.heading!),
    ).toBeLessThan(5);
  });
});

describe("fixes", () => {
  it("smooths the position and keeps altitude and accuracy", () => {
    const { clock, geo, source } = setup();
    source.start();
    geo.emit({ east: 0, altitude: 80, altitudeAccuracy: 9, accuracy: 7 });
    clock.advance(1000);
    geo.emit({ east: 20, altitude: 81, altitudeAccuracy: 9, accuracy: 7 });
    const fix = source.getLastFix()!;
    expect(fix.position.altitude).toBe(81);
    expect(fix.position.altitudeAccuracy).toBe(9);
    expect(fix.position.accuracy).toBe(7);
    const raw = fromLocalMetres(ORIGIN, { east: 20, north: 0 });
    // Smoothing keeps it close to the report and not equal to it.
    expect(haversineDistance(fix.position, raw)).toBeLessThan(20);
  });

  it("leaves altitude out when the browser has none, and stamps the fix with the clock", () => {
    const { clock, geo, source } = setup();
    source.start();
    clock.advance(1234);
    geo.emit({});
    const fix = source.getLastFix()!;
    expect("altitude" in fix.position).toBe(false);
    expect(fix.timestamp).toBe(clock.now());
  });

  it("tells fix listeners and stops when they unsubscribe", () => {
    const { geo, source } = setup();
    const seen: number[] = [];
    const off = source.onFix((f) => seen.push(f.timestamp));
    source.start();
    geo.emit({});
    off();
    geo.emit({});
    expect(seen).toHaveLength(1);
  });

  it("gives the motion the mock vehicle reads, with elapsed time since the start", () => {
    const { clock, geo, source } = setup();
    expect(source.getMotion().elapsedSeconds).toBe(0);
    source.start();
    clock.advance(4000);
    geo.emit({ speed: 5 });
    expect(source.getMotion().elapsedSeconds).toBeCloseTo(4, 6);
    expect(source.getMotion().speedMps).toBeCloseTo(5, 6);
    source.stop();
    expect(source.getMotion()).toEqual({ speedMps: 0, elapsedSeconds: 0 });
  });

  it("never keeps a trace: only the latest fix is held", () => {
    const { clock, geo, source } = setup();
    source.start();
    for (let i = 0; i < 50; i++) {
      clock.advance(1000);
      geo.emit({ east: i * 5 });
    }
    expect(Object.keys(source).some((k) => /trace|history|track/i.test(k))).toBe(false);
  });
});
