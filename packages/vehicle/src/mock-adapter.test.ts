import { describe, expect, it } from "vitest";
import { createManualClock, GpsSimulator, DEMO_ROUTE, kmhToMps, mpsToKmh } from "@waylit/core";
import { createMockVehicleAdapter } from "./mock-adapter";
import { selectSpeed } from "./speed-selection";
import type { VehicleTelemetry } from "./types";

const motionAt = (kmh: number) => {
  const state = { speedMps: kmhToMps(kmh), elapsedSeconds: 0 };
  return { state, source: { getMotion: () => ({ ...state }) } };
};

async function setup(kmh: number, options: Parameters<typeof createMockVehicleAdapter>[0] = {}) {
  const clock = createManualClock(1_000_000);
  const motion = motionAt(kmh);
  const adapter = createMockVehicleAdapter({ clock, motion: motion.source, ...options });
  const samples: VehicleTelemetry[] = [];
  adapter.onTelemetry((s) => samples.push(s));
  await adapter.connect();
  const ride = (seconds: number, stepSeconds = 0.25) => {
    for (let t = 0; t < seconds; t += stepSeconds) {
      clock.advance(stepSeconds * 1000);
      motion.state.elapsedSeconds += stepSeconds;
      adapter.tick();
    }
  };
  return { clock, adapter, samples, ride, motion };
}

describe("mock vehicle adapter", () => {
  it("describes itself as a simulated vehicle", () => {
    const a = createMockVehicleAdapter();
    expect(a.info.adapterId).toBe("mock");
    expect(a.info.displayName).toMatch(/simulated/i);
  });

  it("walks through connection states and notifies listeners", async () => {
    const a = createMockVehicleAdapter({ clock: createManualClock() });
    const seen: string[] = [];
    a.onConnectionStateChange((s) => seen.push(s));
    expect(a.getConnectionState()).toBe("disconnected");
    await a.connect();
    await a.disconnect();
    expect(seen).toEqual(["connecting", "connected", "disconnected"]);
  });

  it("emits nothing until connected", () => {
    const a = createMockVehicleAdapter({ clock: createManualClock() });
    const samples: VehicleTelemetry[] = [];
    a.onTelemetry((s) => samples.push(s));
    a.tick();
    expect(samples).toHaveLength(0);
  });

  it("emits at the sample interval, not on every tick", async () => {
    const { samples, ride } = await setup(20, { sampleIntervalMs: 500 });
    ride(5, 0.1);
    expect(samples.length).toBeGreaterThanOrEqual(9);
    expect(samples.length).toBeLessThanOrEqual(11);
  });

  it("reports realistic values at a steady 20 km/h", async () => {
    const { samples, ride } = await setup(20);
    ride(60);
    const last = samples.at(-1)!;
    expect(mpsToKmh(last.speedMps!)).toBeGreaterThan(19.5);
    expect(mpsToKmh(last.speedMps!)).toBeLessThan(22);
    expect(last.batteryPercent).toBeLessThanOrEqual(100);
    expect(last.batteryPercent).toBeGreaterThanOrEqual(98);
    expect(last.rangeMetres).toBeGreaterThan(30_000);
    expect(last.tripDurationSeconds).toBe(60);
    expect(last.tripDistanceMetres!).toBeGreaterThan(300);
    expect(last.ridingMode).toBe("Sport");
    expect(last.timestamp).toBeGreaterThan(1_000_000);
  });

  it("never reports more than the speed limit, 25 km/h by default", async () => {
    const { samples, ride } = await setup(40);
    ride(10);
    for (const s of samples) expect(mpsToKmh(s.speedMps!)).toBeLessThanOrEqual(25.001);
    expect(mpsToKmh(samples.at(-1)!.speedMps!)).toBeCloseTo(25, 1);
  });

  it("honours a lower speed limit from config", async () => {
    const { samples, ride } = await setup(40, { speedLimitKmh: 15 });
    ride(10);
    expect(mpsToKmh(samples.at(-1)!.speedMps!)).toBeCloseTo(15, 1);
  });

  it("reads speed separately from the true speed", async () => {
    const { samples, ride, motion } = await setup(20);
    ride(5);
    expect(samples.at(-1)!.speedMps).not.toBe(motion.state.speedMps);
  });

  it("drains the battery over a longer ride and range falls with it", async () => {
    const { samples, ride } = await setup(22, { initialBatteryPercent: 90 });
    ride(1800, 1);
    const first = samples[0]!;
    const last = samples.at(-1)!;
    expect(last.batteryPercent!).toBeLessThan(first.batteryPercent!);
    expect(last.rangeMetres!).toBeLessThan(first.rangeMetres!);
    // 30 minutes at 22 km/h is 11 km, which should cost roughly a quarter of the battery.
    expect(90 - last.batteryPercent!).toBeGreaterThan(10);
    expect(90 - last.batteryPercent!).toBeLessThan(35);
    expect(last.tripDistanceMetres!).toBeGreaterThan(10_000);
  });

  it("counts trip distance from vehicle speed and adds it to the odometer", async () => {
    const { samples, ride } = await setup(20, { initialOdometerMetres: 5000 });
    ride(100, 1);
    const last = samples.at(-1)!;
    expect(last.odometerMetres).toBe(5000 + last.tripDistanceMetres!);
  });

  it("starts a new trip without touching battery or odometer", async () => {
    const { adapter, samples, ride } = await setup(20);
    ride(60, 1);
    const before = samples.at(-1)!;
    adapter.startTrip();
    ride(1, 1);
    const after = samples.at(-1)!;
    expect(after.tripDistanceMetres!).toBeLessThan(before.tripDistanceMetres!);
    expect(after.tripDurationSeconds).toBe(1);
    expect(after.odometerMetres!).toBeGreaterThanOrEqual(before.odometerMetres!);
    expect(after.batteryPercent!).toBeLessThanOrEqual(before.batteryPercent!);
  });

  it("omits fields on request so the GPS fallback can be exercised", async () => {
    const { adapter, samples, ride } = await setup(20, { omitFields: ["speedMps"] });
    ride(1);
    expect("speedMps" in samples.at(-1)!).toBe(false);
    expect(adapter.capabilities.fields).not.toContain("speedMps");
    adapter.setOmittedFields([]);
    ride(1);
    expect(samples.at(-1)!.speedMps).toBeDefined();
  });

  it("is repeatable for a given seed", async () => {
    const a = await setup(20, { seed: 5 });
    const b = await setup(20, { seed: 5 });
    a.ride(30);
    b.ride(30);
    expect(a.samples).toEqual(b.samples);
  });

  it("runs itself when given a scheduler, and stops on disconnect", async () => {
    const clock = createManualClock(0);
    let callback: (() => void) | undefined;
    let cleared = false;
    const adapter = createMockVehicleAdapter({
      clock,
      scheduler: {
        setInterval: (cb) => {
          callback = cb;
          return 1;
        },
        clearInterval: () => {
          cleared = true;
        },
      },
    });
    const samples: VehicleTelemetry[] = [];
    adapter.onTelemetry((s) => samples.push(s));
    await adapter.connect();
    clock.advance(250);
    callback?.();
    expect(samples).toHaveLength(1);
    await adapter.disconnect();
    expect(cleared).toBe(true);
  });

  it("exposes no way to send commands", () => {
    const a = createMockVehicleAdapter();
    const names = Object.keys(a);
    expect(
      names.filter((n) => /^(send|write|set(?!OmittedFields)|command|unlock|lock)/i.test(n)),
    ).toEqual([]);
  });
});

describe("mock vehicle with the GPS simulator", () => {
  it("keeps vehicle speed and GPS speed separate, and falls back to GPS when telemetry stops", async () => {
    const clock = createManualClock(0);
    const sim = new GpsSimulator({ path: DEMO_ROUTE.path, clock, cruiseSpeedKmh: 22 });
    const adapter = createMockVehicleAdapter({ clock, motion: sim });
    let latest: VehicleTelemetry | undefined;
    adapter.onTelemetry((s) => (latest = s));
    await adapter.connect();
    sim.start();
    for (let i = 0; i < 40; i++) {
      clock.advance(1000);
      sim.update();
      adapter.tick();
    }
    const gps = sim.getLastFix()!;
    expect(latest?.speedMps).not.toBe(gps.speedMps);
    expect(selectSpeed({ vehicle: latest, gps, nowMs: clock.now() }).source).toBe("vehicle");

    // The vehicle goes quiet. After the stale window GPS takes over.
    for (let i = 0; i < 3; i++) {
      clock.advance(1000);
      sim.update();
    }
    const result = selectSpeed({ vehicle: latest, gps: sim.getLastFix(), nowMs: clock.now() });
    expect(result.source).toBe("gps");
    expect(result.fallbackReason).toBe("vehicle-telemetry-stale");
  });
});
