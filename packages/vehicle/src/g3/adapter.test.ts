import { describe, expect, it } from "vitest";
import { selectSpeed } from "../speed-selection";
import type { VehicleTelemetry } from "../types";
import {
  createWebBluetoothAdapter,
  type CredentialStore,
  type WebBluetoothAdapterOptions,
} from "./adapter";
import { createG3Simulator, type G3SimulatorOptions } from "./sim";
import { isAllowedRequest } from "./guard";
import {
  ChooserCancelledError,
  type BleConnection,
  type BleDeviceHandle,
  type BleTransport,
} from "./transport";

/** Real timers with short waits: WebCrypto runs off the main thread, so fake timers do not fit. */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, label: string, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${label}`);
    await sleep(4);
  }
}

function memoryStore(initial?: Uint8Array) {
  const map = new Map<string, Uint8Array>();
  const calls: string[] = [];
  if (initial) map.set("NB-DESKSIM", initial);
  const store: CredentialStore = {
    load: (name) => map.get(name),
    save: (name, password) => {
      calls.push("save");
      map.set(name, password.slice());
    },
    clear: (name) => {
      calls.push("clear");
      map.delete(name);
    },
  };
  return { store, map, calls };
}

const FAST = {
  fastPollMs: 5,
  slowPollMs: 15,
  requestTimeoutMs: 250,
  pieceGapMs: 0,
  pairingRetryMs: 10,
  pairingTimeoutMs: 2000,
  retryDelaysMs: [10, 20, 30],
} as const;

function setup(
  simOptions: G3SimulatorOptions = {},
  adapterOptions: Partial<WebBluetoothAdapterOptions> = {},
  store = memoryStore(),
  wrap?: (transport: BleTransport) => BleTransport,
) {
  const sim = createG3Simulator({ latencyMs: 1, pendingPairings: 1, ...simOptions });
  const adapter = createWebBluetoothAdapter({
    transport: wrap ? wrap(sim.transport) : sim.transport,
    credentials: store.store,
    ...FAST,
    ...adapterOptions,
  });
  const samples: VehicleTelemetry[] = [];
  const states: string[] = [];
  adapter.onTelemetry((s) => samples.push(s));
  adapter.onConnectionStateChange((s) => states.push(s));
  return { sim, adapter, samples, states, store };
}

describe("web bluetooth adapter on the desk simulator", () => {
  it("starts idle and says what it is", () => {
    const { adapter } = setup();
    expect(adapter.getConnectionState()).toBe("idle");
    expect(adapter.info.displayName).toMatch(/MAX G3/);
    expect(adapter.capabilities.fields).toContain("speedMps");
  });

  it("needs pairing first, and then makes up nothing", async () => {
    const { adapter, samples, sim, store } = setup();
    await adapter.connect();
    expect(adapter.getStatus()).toEqual({ state: "auth-needed", detail: "not-paired" });
    await sleep(40);
    expect(samples).toHaveLength(0);
    expect(store.map.size).toBe(0);
    // Only the first contact step was sent.
    expect(sim.received.map((r) => r.command)).toEqual([0x5b]);
    adapter.dispose();
  });

  it("pairs on request, then reports connected and live telemetry", async () => {
    const { adapter, samples, sim, states, store } = setup();
    await adapter.connect();
    await adapter.pair();
    expect(adapter.getConnectionState()).toBe("connected");
    expect(sim.isPaired()).toBe(true);
    expect(store.map.get("NB-DESKSIM")?.length).toBe(16);
    expect(states).toContain("authenticating");
    await until(() => samples.length > 10, "telemetry");
    const last = samples[samples.length - 1] as VehicleTelemetry;
    expect(last.speedMps).toBeGreaterThanOrEqual(0);
    expect(last.speedMps).toBeLessThan(25 / 3.6 + 0.5);
    await until(() => samples.some((s) => s.batteryPercent !== undefined), "battery");
    await until(
      () =>
        [
          "rangeMetres",
          "tripDistanceMetres",
          "odometerMetres",
          "ridingMode",
          "temperatureCelsius",
          "errorCodes",
          "warningCodes",
        ].every((key) =>
          samples.some((s) => (s as unknown as Record<string, unknown>)[key] !== undefined),
        ),
      "every field",
    );
    const battery = samples.find((s) => s.batteryPercent !== undefined)?.batteryPercent ?? 0;
    expect(battery).toBeGreaterThan(50);
    expect(battery).toBeLessThanOrEqual(100);
    adapter.dispose();
  });

  it("sends only handshake and allowlisted read requests", async () => {
    const { adapter, samples, sim } = setup();
    await adapter.connect();
    await adapter.pair();
    await until(() => samples.length > 25, "telemetry");
    adapter.dispose();
    expect(sim.received.length).toBeGreaterThan(25);
    for (const request of sim.received) {
      const shape = {
        source: 0x3e,
        target: request.target,
        command: request.command,
        index: request.index,
        payload:
          request.command === 0x5c
            ? new Uint8Array(16)
            : request.command === 0x5d
              ? new Uint8Array(14)
              : request.command === 0x01
                ? Uint8Array.of(request.index === 0x62 ? 4 : 2)
                : new Uint8Array(0),
      };
      expect(isAllowedRequest(shape), `command ${request.command} register ${request.index}`).toBe(
        true,
      );
    }
  });

  it("goes through the pending pairing wait that a button press needs", async () => {
    const { adapter, sim } = setup({ pendingPairings: 3 });
    await adapter.connect();
    await adapter.pair();
    expect(adapter.getConnectionState()).toBe("connected");
    expect(sim.received.filter((r) => r.command === 0x5c)).toHaveLength(4);
    adapter.dispose();
  });

  it("gives up pairing at its time limit and reports auth needed", async () => {
    const { adapter, store } = setup(
      { pendingPairings: 1000 },
      { pairingTimeoutMs: 120, pairingRetryMs: 15 },
    );
    await adapter.connect();
    await adapter.pair();
    expect(adapter.getStatus()).toEqual({ state: "auth-needed", detail: "pairing-timeout" });
    expect(store.map.size).toBe(0);
    adapter.dispose();
  });

  it("reconnects with the stored pairing and does not pair again", async () => {
    const first = setup();
    await first.adapter.connect();
    await first.adapter.pair();
    const password = first.store.map.get("NB-DESKSIM");
    expect(password).toBeDefined();
    first.adapter.dispose();

    // A second adapter on the same pretend scooter, with the stored pairing.
    const store = memoryStore(password);
    const adapter = createWebBluetoothAdapter({
      transport: first.sim.transport,
      credentials: store.store,
      ...FAST,
    });
    await adapter.connect();
    expect(adapter.getConnectionState()).toBe("connected");
    expect(first.sim.received.filter((r) => r.command === 0x5c)).toHaveLength(2);
    adapter.dispose();
  });

  it("clears a pairing the scooter explicitly refuses and asks for pairing again", async () => {
    const password = new Uint8Array(16).fill(7);
    const { adapter, store } = setup({ password, refuseAuth: true }, {}, memoryStore(password));
    await adapter.connect();
    expect(adapter.getStatus()).toEqual({ state: "auth-needed", detail: "rejected" });
    expect(store.calls).toContain("clear");
    expect(store.map.size).toBe(0);
    adapter.dispose();
  });

  it("keeps a stored pairing when the scooter is merely silent, and pairing replaces it", async () => {
    const stale = new Uint8Array(16).fill(9);
    const { adapter, store, sim } = setup(
      { password: new Uint8Array(16).fill(7) },
      {},
      memoryStore(stale),
    );
    await adapter.connect();
    expect(adapter.getStatus()).toEqual({ state: "auth-needed", detail: "rejected" });
    expect(store.calls).not.toContain("clear");
    await adapter.pair();
    expect(adapter.getConnectionState()).toBe("connected");
    expect(sim.isPaired()).toBe(true);
    expect(store.map.get("NB-DESKSIM")).not.toEqual(stale);
    adapter.dispose();
  });

  it("falls back to GPS speed once the link drops, and stops emitting", async () => {
    const { adapter, samples, sim } = setup(
      { fixedSpeedKmh: 18 },
      { isSessionActive: () => false },
    );
    await adapter.connect();
    await adapter.pair();
    await until(() => samples.some((s) => s.speedMps !== undefined), "speed");
    const gps = { position: { lat: 0, lng: 0 }, timestamp: Date.now(), speedMps: 3 };

    const live = samples[samples.length - 1] as VehicleTelemetry;
    expect(selectSpeed({ vehicle: live, gps, nowMs: live.timestamp }).source).toBe("vehicle");

    sim.dropLink();
    await until(() => adapter.getConnectionState() === "disconnected", "disconnected");
    const countAtDrop = samples.length;
    await sleep(60);
    expect(samples.length).toBe(countAtDrop);
    expect(adapter.getStatus()).toEqual({ state: "disconnected", detail: "needs-tap" });

    // The last sample goes stale after two seconds and GPS takes over.
    const last = samples[samples.length - 1] as VehicleTelemetry;
    const later = selectSpeed({
      vehicle: last,
      gps: { ...gps, timestamp: last.timestamp + 2500 },
      nowMs: last.timestamp + 2500,
    });
    expect(later.source).toBe("gps");
    expect(later.fallbackReason).toBe("vehicle-telemetry-stale");
    adapter.dispose();
  });

  it("retries after a drop while the ride is active, then recovers", async () => {
    const { adapter, samples, sim } = setup({ fixedSpeedKmh: 12 }, { isSessionActive: () => true });
    await adapter.connect();
    await adapter.pair();
    await until(() => samples.length > 3, "telemetry");
    sim.dropLink();
    await until(() => adapter.getConnectionState() === "disconnected", "disconnected");
    await until(() => adapter.getConnectionState() === "connected", "reconnected");
    const before = samples.length;
    await until(() => samples.length > before + 3, "telemetry again");
    adapter.dispose();
  });

  it("reports an error when the very first connect fails", async () => {
    const failing: BleDeviceHandle = {
      name: "NB-DESKSIM",
      connect: async () => {
        throw new Error("out of range");
      },
    };
    const adapter = createWebBluetoothAdapter({
      transport: { support: () => ({ supported: true }), requestDevice: async () => failing },
      credentials: memoryStore().store,
      ...FAST,
    });
    await adapter.connect();
    expect(adapter.getStatus()).toEqual({ state: "error", detail: "connect-failed" });
    adapter.dispose();
  });

  it("asks for a tap after the retries are used up", async () => {
    let allowConnect = true;
    const wrap = (inner: BleTransport): BleTransport => ({
      support: () => inner.support(),
      requestDevice: async () => {
        const handle = await inner.requestDevice();
        return {
          name: handle.name,
          connect: async () => {
            if (!allowConnect) throw new Error("out of range");
            return handle.connect();
          },
        };
      },
    });
    const { adapter, sim } = setup({}, { isSessionActive: () => true }, memoryStore(), wrap);
    await adapter.connect();
    await adapter.pair();
    allowConnect = false;
    sim.dropLink();
    await until(() => adapter.getStatus().detail === "needs-tap", "needs-tap");
    expect(adapter.getConnectionState()).toBe("disconnected");
    adapter.dispose();
  });

  it("stops retrying when asked to, and a tap works again afterwards", async () => {
    let active = true;
    const { adapter, sim } = setup({}, { isSessionActive: () => active });
    await adapter.connect();
    await adapter.pair();
    active = false;
    sim.dropLink();
    await until(() => adapter.getStatus().detail === "needs-tap", "needs-tap");
    active = true;
    await adapter.connect();
    expect(adapter.getConnectionState()).toBe("connected");
    adapter.dispose();
  });

  it("retries at once with retryNow when the screen comes back", async () => {
    let active = true;
    const { adapter, sim } = setup({}, { isSessionActive: () => active });
    await adapter.connect();
    await adapter.pair();
    active = false;
    sim.dropLink();
    await until(() => adapter.getStatus().detail === "needs-tap", "needs-tap");
    active = true;
    adapter.retryNow();
    await until(() => adapter.getConnectionState() === "connected", "reconnected");
    adapter.dispose();
  });

  it("treats a link that stops answering as lost", async () => {
    let mute = false;
    const wrap = (inner: BleTransport): BleTransport => ({
      support: () => inner.support(),
      requestDevice: async () => {
        const handle = await inner.requestDevice();
        return {
          name: handle.name,
          connect: async (): Promise<BleConnection> => {
            const connection = await handle.connect();
            return {
              ...connection,
              writePieceSize: connection.writePieceSize,
              write: (piece) => connection.write(piece),
              onNotify: (listener) =>
                connection.onNotify((piece) => {
                  if (!mute) listener(piece);
                }),
              onDisconnect: (l) => connection.onDisconnect(l),
              close: () => connection.close(),
            };
          },
        };
      },
    });
    const { adapter, samples } = setup(
      {},
      { isSessionActive: () => false, requestTimeoutMs: 30 },
      memoryStore(),
      wrap,
    );
    await adapter.connect();
    await adapter.pair();
    await until(() => samples.length > 3, "telemetry");
    mute = true;
    await until(() => adapter.getConnectionState() === "disconnected", "stalled link detected");
    adapter.dispose();
  });

  it("finds the board that answers by trying the candidates", async () => {
    const { adapter, sim } = setup({ answerTarget: 0x01 });
    await adapter.connect();
    await adapter.pair();
    expect(adapter.getConnectionState()).toBe("connected");
    const targets = new Set(sim.received.filter((r) => r.command === 0x01).map((r) => r.target));
    expect(targets.has(0x09)).toBe(true);
    expect(targets.has(0x01)).toBe(true);
    adapter.dispose();
  });

  it("reports an error, not fake data, when no board answers telemetry", async () => {
    const { adapter, samples } = setup({ answerTarget: 0x77 });
    await adapter.connect();
    await adapter.pair();
    expect(adapter.getStatus()).toEqual({ state: "error", detail: "no-telemetry" });
    expect(samples).toHaveLength(0);
    adapter.dispose();
  });

  it("ignores a second tap while connecting", async () => {
    const { adapter, sim } = setup();
    await Promise.all([adapter.connect(), adapter.connect()]);
    expect(sim.received.filter((r) => r.command === 0x5b).length).toBe(1);
    adapter.dispose();
  });

  it("disconnect ends everything and stops telemetry", async () => {
    const { adapter, samples } = setup();
    await adapter.connect();
    await adapter.pair();
    await until(() => samples.length > 3, "telemetry");
    await adapter.disconnect();
    expect(adapter.getConnectionState()).toBe("disconnected");
    const count = samples.length;
    await sleep(60);
    expect(samples.length).toBe(count);
    adapter.dispose();
  });

  it("forgets a pairing on request", async () => {
    const { adapter, store } = setup();
    await adapter.connect();
    await adapter.pair();
    expect(store.map.size).toBe(1);
    adapter.forgetPairing();
    expect(store.map.size).toBe(0);
    adapter.dispose();
  });
});

describe("unsupported and cancelled", () => {
  it("reports unsupported with the reason and never opens the chooser", async () => {
    let asked = 0;
    const adapter = createWebBluetoothAdapter({
      transport: {
        support: () => ({ supported: false, reason: "ios" }),
        requestDevice: async () => {
          asked++;
          throw new Error("should not be called");
        },
      },
      credentials: memoryStore().store,
    });
    await adapter.connect();
    expect(adapter.getStatus()).toEqual({ state: "unsupported", detail: "ios" });
    expect(asked).toBe(0);
  });

  it("goes back to idle when the chooser is closed", async () => {
    const adapter = createWebBluetoothAdapter({
      transport: {
        support: () => ({ supported: true }),
        requestDevice: async () => {
          throw new ChooserCancelledError();
        },
      },
      credentials: memoryStore().store,
    });
    await adapter.connect();
    expect(adapter.getStatus()).toEqual({ state: "idle", detail: "chooser-cancelled" });
  });

  it("reports an error when the chooser fails for another reason", async () => {
    const adapter = createWebBluetoothAdapter({
      transport: {
        support: () => ({ supported: true }),
        requestDevice: async () => {
          throw new Error("SecurityError");
        },
      },
      credentials: memoryStore().store,
    });
    await adapter.connect();
    expect(adapter.getStatus().state).toBe("error");
  });
});
