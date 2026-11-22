import { describe, expect, it } from "vitest";
import { createManualClock } from "./clock";
import { DEMO_ROUTE } from "./demo-route";
import { GpsSimulator, type GpsSimulatorOptions } from "./gps-simulator";
import { haversineDistance } from "./geo";
import { kmhToMps } from "./units";
import type { PositionFix } from "./types";

const straight = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.01 },
];
const perfect = { positionStdMetres: 0, speedStdMps: 0, headingStdDegrees: 0 };

function make(overrides: Partial<GpsSimulatorOptions> = {}) {
  const clock = createManualClock(1_000_000);
  const sim = new GpsSimulator({ path: straight, clock, noise: perfect, ...overrides });
  return { clock, sim };
}

function run(clock: ReturnType<typeof createManualClock>, sim: GpsSimulator, seconds: number) {
  const fixes: PositionFix[] = [];
  sim.onFix((f) => fixes.push(f));
  for (let i = 0; i < seconds; i++) {
    clock.advance(1000);
    sim.update();
  }
  return fixes;
}

describe("GpsSimulator", () => {
  it("is idle until started and emits nothing", () => {
    const { clock, sim } = make();
    clock.advance(5000);
    expect(sim.update()).toBeUndefined();
    expect(sim.state).toBe("idle");
  });

  it("emits a first fix at the start, heading east", () => {
    const { sim } = make();
    sim.start();
    const fix = sim.getLastFix();
    expect(fix?.position).toEqual(straight[0]);
    expect(fix?.heading).toBeCloseTo(90, 3);
    expect(fix?.speedMps).toBe(0);
  });

  it("accelerates to the cruise speed and holds it", () => {
    const { clock, sim } = make({ cruiseSpeedKmh: 18 });
    sim.start();
    run(clock, sim, 30);
    expect(sim.getTruth().speedMps).toBeCloseTo(kmhToMps(18), 2);
    expect(sim.getLastFix()?.speedMps).toBeCloseTo(kmhToMps(18), 1);
  });

  it("makes one fix per interval whatever the call rate", () => {
    const a = make();
    const b = make();
    a.sim.start();
    b.sim.start();
    for (let i = 0; i < 100; i++) {
      a.clock.advance(100);
      a.sim.update();
    }
    b.clock.advance(10_000);
    b.sim.update();
    expect(a.sim.getTruth().distanceMetres).toBeCloseTo(b.sim.getTruth().distanceMetres, 6);
    expect(a.sim.getLastFix()?.position.lng).toBeCloseTo(b.sim.getLastFix()?.position.lng ?? 0, 9);
  });

  it("is repeatable with the same seed and different with another", () => {
    const options = { noise: {} } as const;
    const first = make({ ...options, seed: 7, path: DEMO_ROUTE.path });
    const second = make({ ...options, seed: 7, path: DEMO_ROUTE.path });
    const third = make({ ...options, seed: 8, path: DEMO_ROUTE.path });
    const outputs = [first, second, third].map(({ clock, sim }) => {
      sim.start();
      run(clock, sim, 60);
      return sim.getLastFix();
    });
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0]).not.toEqual(outputs[2]);
  });

  it("smoothed fixes sit closer to the truth than raw noisy fixes", () => {
    const { clock, sim } = make({ noise: { positionStdMetres: 4 }, seed: 3 });
    sim.start();
    let raw = 0;
    let smooth = 0;
    let n = 0;
    for (let i = 0; i < 100; i++) {
      clock.advance(1000);
      sim.update();
      if (i < 20) continue;
      const truthLng =
        (sim.getTruth().distanceMetres / haversineDistance(straight[0]!, straight[1]!)) * 0.01;
      const truth = { lat: 0, lng: truthLng };
      raw += haversineDistance(sim.getLastRawFix()!.position, truth) ** 2;
      smooth += haversineDistance(sim.getLastFix()!.position, truth) ** 2;
      n++;
    }
    expect(Math.sqrt(smooth / n)).toBeLessThan(Math.sqrt(raw / n));
  });

  it("pauses and resumes without counting the paused time", () => {
    const { clock, sim } = make();
    sim.start();
    run(clock, sim, 10);
    sim.pause();
    expect(sim.state).toBe("paused");
    const before = sim.getTruth();
    clock.advance(60_000);
    sim.update();
    expect(sim.getTruth()).toEqual(before);
    sim.resume();
    expect(sim.state).toBe("playing");
    run(clock, sim, 5);
    expect(sim.getTruth().elapsedSeconds).toBeCloseTo(before.elapsedSeconds + 5, 6);
    expect(sim.getTruth().distanceMetres).toBeGreaterThan(before.distanceMetres);
  });

  it("covers the same distance in half the clock time at double playback speed", () => {
    const normal = make();
    const fast = make({ playbackSpeed: 2 });
    normal.sim.start();
    fast.sim.start();
    run(normal.clock, normal.sim, 20);
    run(fast.clock, fast.sim, 10);
    expect(fast.sim.getTruth().elapsedSeconds).toBeCloseTo(20, 6);
    expect(fast.sim.getTruth().distanceMetres).toBeCloseTo(normal.sim.getTruth().distanceMetres, 6);
  });

  it("applies a playback speed change from that moment on", () => {
    const { clock, sim } = make();
    sim.start();
    run(clock, sim, 10);
    sim.setPlaybackSpeed(3);
    run(clock, sim, 10);
    expect(sim.getTruth().elapsedSeconds).toBeCloseTo(40, 6);
    expect(() => sim.setPlaybackSpeed(0)).toThrow(RangeError);
  });

  it("slows for a sharp corner and speeds up again", () => {
    const corner = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
      { lat: 0.0001, lng: 0.01 },
      { lat: 0.01, lng: 0.01 },
    ];
    const { clock, sim } = make({ path: corner, cruiseSpeedKmh: 24 });
    sim.start();
    let minNearCorner = Infinity;
    let top = 0;
    for (let i = 0; i < 200; i++) {
      clock.advance(1000);
      sim.update();
      const t = sim.getTruth();
      top = Math.max(top, t.speedMps);
      if (t.distanceMetres > 1100 && t.distanceMetres < 1130)
        minNearCorner = Math.min(minNearCorner, t.speedMps);
    }
    expect(top).toBeGreaterThan(kmhToMps(23));
    expect(minNearCorner).toBeLessThan(kmhToMps(15));
  });

  it("finishes at the end of the route, stopped", () => {
    const { clock, sim } = make({ path: [straight[0]!, { lat: 0, lng: 0.001 }] });
    sim.start();
    run(clock, sim, 120);
    expect(sim.state).toBe("finished");
    expect(sim.getTruth().speedMps).toBe(0);
    // Smoothing may overshoot a stop by a few metres. Allow five.
    const end = { lat: 0, lng: 0.001 };
    expect(haversineDistance(sim.getLastFix()!.position, end)).toBeLessThan(5);
  });

  it("loops back to the start when asked", () => {
    const { clock, sim } = make({ path: DEMO_ROUTE.path, loop: true, cruiseSpeedKmh: 25 });
    sim.start();
    run(clock, sim, 1200);
    expect(sim.state).toBe("playing");
    expect(sim.getTruth().distanceMetres).toBeLessThan(DEMO_ROUTE.distanceMetres);
    expect(sim.getTruth().elapsedSeconds).toBeGreaterThan(1100);
  });

  it("stop returns to idle and start begins again from the beginning", () => {
    const { clock, sim } = make();
    sim.start();
    run(clock, sim, 10);
    sim.stop();
    expect(sim.state).toBe("idle");
    sim.start();
    expect(sim.getTruth().distanceMetres).toBe(0);
  });

  it("skips very long gaps instead of flooding listeners", () => {
    const { clock, sim } = make();
    const fixes: PositionFix[] = [];
    sim.start();
    sim.onFix((f) => fixes.push(f));
    clock.advance(3_600_000);
    sim.update();
    expect(fixes.length).toBeLessThanOrEqual(10);
  });
});
