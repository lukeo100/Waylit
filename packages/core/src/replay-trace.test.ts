import { describe, expect, it } from "vitest";
import { createManualClock } from "./clock";
import { haversineDistance } from "./geo";
import { LiveGpsSource } from "./live-gps";
import { REPLAY_CENTRE, createReplayGeolocation, generateReplayTrace } from "./replay-trace";
import type { GpsStatus } from "./position-source";

describe("generateReplayTrace", () => {
  it("is repeatable for a seed and differs for another", () => {
    const a = generateReplayTrace({ seed: 3 });
    expect(generateReplayTrace({ seed: 3 })).toEqual(a);
    expect(generateReplayTrace({ seed: 4 })).not.toEqual(a);
  });

  it("stays near its centre, never near a recorded place, and has the real world habits", () => {
    const trace = generateReplayTrace();
    for (const p of trace) {
      const d = haversineDistance(REPLAY_CENTRE, {
        lat: p.position.coords.latitude,
        lng: p.position.coords.longitude,
      });
      expect(d).toBeLessThan(200);
    }
    // Stopped at the start with no heading, then moving with one.
    expect(trace[0]!.position.coords.heading).toBeNull();
    expect(trace.some((p) => p.position.coords.heading !== null)).toBe(true);
    // A weak patch, and a gap of more than ten seconds.
    expect(trace.some((p) => p.position.coords.accuracy > 50)).toBe(true);
    const gaps = trace.slice(1).map((p, i) => p.t - trace[i]!.t);
    expect(Math.max(...gaps)).toBeGreaterThan(10);
  });
});

describe("replay through the live source", () => {
  it("runs the same states a phone would: requesting, active, weak, stale, active", () => {
    const clock = createManualClock(0);
    const callbacks: (() => void)[] = [];
    const geolocation = createReplayGeolocation({
      clock,
      timers: {
        setInterval: (cb) => {
          callbacks.push(cb);
          return callbacks.length;
        },
        clearInterval: () => undefined,
      },
    });
    const source = new LiveGpsSource({ geolocation, clock });
    const seen: GpsStatus[] = [];
    source.onStatus((s) => seen.push(s));
    source.start();
    for (let ms = 0; ms < 200_000; ms += 250) {
      clock.advance(250);
      callbacks[0]?.();
      source.update();
    }
    expect(seen[0]).toBe("requesting");
    expect(seen).toContain("active");
    expect(seen).toContain("weak");
    expect(seen).toContain("stale");
    expect(seen.at(-1)).toBe("active");
    expect(source.getLastFix()).toBeDefined();
  });

  it("stops when the watch is cleared", () => {
    const clock = createManualClock(0);
    let cleared = false;
    const geolocation = createReplayGeolocation({
      clock,
      timers: { setInterval: () => 1, clearInterval: () => void (cleared = true) },
    });
    const source = new LiveGpsSource({ geolocation, clock });
    source.start();
    source.stop();
    expect(cleared).toBe(true);
  });
});
