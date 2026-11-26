import { describe, expect, it } from "vitest";
import type { BleTransport, VehicleAdapter } from "@waylit/vehicle";
import {
  browserCredentials,
  createInertVehicleController,
  createVehicleController,
  memoryCredentials,
} from "./vehicle-controller";
import { VEHICLE_STORAGE_KEY } from "./vehicle-settings";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function memory() {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  };
}

const unsupportedTransport = (): BleTransport => ({
  support: () => ({ supported: false, reason: "ios" }),
  requestDevice: async () => {
    throw new Error("never");
  },
});

function make(search = "", stored?: string, createTransport = unsupportedTransport) {
  const m = memory();
  if (stored) m.map.set(VEHICLE_STORAGE_KEY, JSON.stringify({ vehicle: stored }));
  const controller = createVehicleController({
    search,
    storage: m.storage,
    createTransport,
    credentials: memoryCredentials(),
  });
  return { controller, m };
}

describe("vehicle controller", () => {
  it("is the mock by default, with no adapter and nothing opened", () => {
    const { controller } = make();
    expect(controller.getSnapshot()).toMatchObject({ mode: "mock", lockedByAddress: false });
    expect(controller.getAdapter()).toBeUndefined();
  });

  it("uses the stored choice, and the address wins", () => {
    expect(make("", "g3").controller.getSnapshot().mode).toBe("g3");
    const locked = make("?vehicle=mock", "g3").controller;
    expect(locked.getSnapshot()).toMatchObject({ mode: "mock", lockedByAddress: true });
  });

  it("does not change the vehicle when the address decides", () => {
    const { controller, m } = make("?vehicle=mock");
    controller.setChoice("g3");
    expect(controller.getSnapshot().mode).toBe("mock");
    expect(m.map.has(VEHICLE_STORAGE_KEY)).toBe(false);
  });

  it("knows a browser cannot do Bluetooth before any tap", () => {
    const { controller } = make("?vehicle=g3");
    expect(controller.getSnapshot().status).toEqual({ state: "unsupported", detail: "ios" });
  });

  it("remembers the choice, swaps the adapter and tells the ride", () => {
    const { controller, m } = make();
    const seen: (VehicleAdapter | undefined)[] = [];
    controller.onAdapterChange((adapter) => seen.push(adapter));
    let notified = 0;
    controller.subscribe(() => notified++);

    controller.setChoice("g3");
    expect(JSON.parse(m.map.get(VEHICLE_STORAGE_KEY) ?? "{}")).toEqual({ vehicle: "g3" });
    expect(controller.getSnapshot().mode).toBe("g3");
    expect(controller.getAdapter()).toBeDefined();
    expect(seen).toHaveLength(1);
    expect(notified).toBeGreaterThan(0);

    controller.setChoice("mock");
    expect(controller.getAdapter()).toBeUndefined();
    expect(seen[1]).toBeUndefined();
    expect(seen).toHaveLength(2);
  });

  it("gives a new snapshot object only when something changed", () => {
    const { controller } = make();
    const a = controller.getSnapshot();
    expect(controller.getSnapshot()).toBe(a);
    controller.setChoice("g3");
    expect(controller.getSnapshot()).not.toBe(a);
  });

  it("runs the desk simulator from ?vehicle=g3sim: pair, connect, telemetry", async () => {
    const { controller } = make("?vehicle=g3sim");
    const adapter = controller.getAdapter();
    expect(adapter?.info.displayName).toMatch(/desk simulator/);
    const samples: number[] = [];
    adapter?.onTelemetry((s) => {
      if (s.speedMps !== undefined) samples.push(s.speedMps);
    });
    await controller.connect();
    expect(controller.getSnapshot().status).toEqual({ state: "auth-needed", detail: "not-paired" });
    await controller.pair();
    expect(controller.getSnapshot().status.state).toBe("connected");
    await sleep(900);
    expect(samples.length).toBeGreaterThan(2);
    await controller.disconnect();
    expect(controller.getSnapshot().status.state).toBe("disconnected");
  }, 15_000);
});

describe("credentials", () => {
  it("stores a pairing as hex under a versioned key and reads it back", () => {
    const { map, storage } = memory();
    const store = browserCredentials(() => storage);
    const secret = Uint8Array.from({ length: 16 }, (_, i) => i * 3);
    store.save("NB-X", secret);
    expect([...map.keys()]).toEqual(["waylit:g3:pairing:v1:NB-X"]);
    expect(store.load("NB-X")).toEqual(secret);
    store.clear("NB-X");
    expect(store.load("NB-X")).toBeUndefined();
  });

  it("ignores a broken stored value and a blocked store", () => {
    const { map, storage } = memory();
    map.set("waylit:g3:pairing:v1:NB-X", "nothex");
    expect(browserCredentials(() => storage).load("NB-X")).toBeUndefined();
    const blocked = browserCredentials(() => {
      throw new Error("blocked");
    });
    expect(blocked.load("a")).toBeUndefined();
    expect(() => {
      blocked.save("a", new Uint8Array(16));
      blocked.clear("a");
    }).not.toThrow();
  });
});

describe("inert controller", () => {
  it("is always the mock and does nothing", async () => {
    const c = createInertVehicleController();
    expect(c.getSnapshot().mode).toBe("mock");
    expect(c.getAdapter()).toBeUndefined();
    await c.connect();
    c.setChoice("g3");
    expect(c.getSnapshot().mode).toBe("mock");
  });
});
