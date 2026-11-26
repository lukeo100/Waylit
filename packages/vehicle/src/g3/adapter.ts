import { systemClock, type Clock } from "@waylit/core";
import type {
  TelemetryField,
  Unsubscribe,
  VehicleAdapter,
  VehicleCapabilities,
  VehicleConnectionState,
  VehicleInfo,
  VehicleTelemetry,
} from "../types";
import { defaultSubtle, type SubtleLike } from "./crypto";
import { READ_TARGETS } from "./guard";
import { READ_REGISTERS, type RegisterKey } from "./registers";
import {
  CounterExhaustedError,
  G3Session,
  ProtocolError,
  RequestTimeoutError,
  SessionClosedError,
  type AuthNeededReason,
  type RandomBytes,
} from "./session";
import { TelemetryAccumulator, decodeRegister } from "./telemetry";
import {
  ChooserCancelledError,
  defaultTimers,
  type BleConnection,
  type BleDeviceHandle,
  type BleTransport,
  type Timers,
  type UnsupportedReason,
} from "./transport";

/**
 * The Bluetooth vehicle adapter for a Segway Ninebot MAX G3. It is read only: it asks for a
 * handful of telemetry registers and reports them through the shared `VehicleAdapter` interface.
 * The mock adapter stays the default, and nothing here runs until the rider taps Connect.
 *
 * Flow: `connect()` (from a tap) shows the chooser, opens the link, sets up the encrypted
 * session and starts polling. If the scooter needs this phone to be paired, the state becomes
 * `auth-needed` and nothing is made up. Pairing happens only when the rider calls `pair()`.
 *
 * When the link drops, telemetry stops at once (the last value is not repeated, so the speed
 * falls back to GPS after its stale limit), and the adapter retries with a growing wait while the
 * ride is active, then asks for a tap.
 */

export type StatusDetail =
  | AuthNeededReason
  | UnsupportedReason
  /** The chooser was closed without picking a scooter. */
  | "chooser-cancelled"
  /** The link was lost. */
  | "link-lost"
  /** Retries are used up or paused: tap Connect to try again. */
  | "needs-tap"
  /** The scooter did not answer the encrypted session setup. */
  | "no-answer"
  /** The scooter answers the session setup but not telemetry reads. */
  | "no-telemetry"
  /** The link could not be opened. */
  | "connect-failed"
  /** Something unexpected happened in the protocol. */
  | "protocol";

export interface AdapterStatus {
  readonly state: VehicleConnectionState;
  readonly detail?: StatusDetail;
}

/** Where the pairing with each scooter is kept, on this device only. */
export interface CredentialStore {
  load(deviceName: string): Uint8Array | undefined;
  save(deviceName: string, password: Uint8Array): void;
  clear(deviceName: string): void;
}

export interface BluetoothVehicleAdapter extends VehicleAdapter {
  getStatus(): AdapterStatus;
  onStatusChange(listener: (status: AdapterStatus) => void): Unsubscribe;
  /** Pairs this phone with the scooter. Only ever call it from an explicit tap. */
  pair(): Promise<void>;
  /** Forgets the stored pairing on this phone. */
  forgetPairing(): void;
  /** Tries to get back a lost link now, for example when the screen comes back. */
  retryNow(): void;
  /** Drops the link and every listener. */
  dispose(): void;
}

export interface WebBluetoothAdapterOptions {
  readonly transport: BleTransport;
  readonly credentials: CredentialStore;
  readonly subtle?: SubtleLike;
  readonly clock?: Clock;
  readonly timers?: Timers;
  readonly randomBytes?: RandomBytes;
  /** True while the rider's session is on, so retries make sense. Default always true. */
  readonly isSessionActive?: () => boolean;
  readonly displayName?: string;
  readonly adapterId?: string;
  /** Time between speed reads. Default 300 ms. */
  readonly fastPollMs?: number;
  /** Time between reads of the slower registers (one per turn). Default 1000 ms. */
  readonly slowPollMs?: number;
  /** Waits before each reconnect try. Default 1, 2, 4, 8 and 15 seconds. */
  readonly retryDelaysMs?: readonly number[];
  readonly requestTimeoutMs?: number;
  readonly pieceGapMs?: number;
  readonly pairingTimeoutMs?: number;
  readonly pairingRetryMs?: number;
  /** Called with every raw register payload. For calibration during development only. */
  readonly onRawRegister?: (key: RegisterKey, payload: Uint8Array) => void;
}

const FIELDS: readonly TelemetryField[] = [
  "speedMps",
  "batteryPercent",
  "rangeMetres",
  "tripDistanceMetres",
  "odometerMetres",
  "ridingMode",
  "temperatureCelsius",
  "errorCodes",
  "warningCodes",
];

const SLOW_REGISTERS: readonly RegisterKey[] = [
  "battery",
  "tripMileage",
  "range",
  "gearMode",
  "errorCode",
  "warningCode",
  "temperature",
  "totalMileage",
];

const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 15_000];
const SPEED_FAILURES_BEFORE_DROP = 5;

type EstablishResult =
  | { readonly kind: "connected" }
  | { readonly kind: "auth-needed"; readonly reason: AuthNeededReason }
  | { readonly kind: "failed"; readonly detail: StatusDetail }
  | { readonly kind: "cancelled" };

export function createWebBluetoothAdapter(
  options: WebBluetoothAdapterOptions,
): BluetoothVehicleAdapter {
  const clock = options.clock ?? systemClock;
  const timers = options.timers ?? defaultTimers;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const fastPollMs = options.fastPollMs ?? 300;
  const slowPollMs = options.slowPollMs ?? 1000;
  const isActive = options.isSessionActive ?? (() => true);
  const info: VehicleInfo = {
    adapterId: options.adapterId ?? "ninebot-g3-ble",
    displayName: options.displayName ?? "Ninebot MAX G3",
  };
  const capabilities: VehicleCapabilities = { fields: FIELDS };

  const telemetryListeners = new Set<(sample: VehicleTelemetry) => void>();
  const statusListeners = new Set<(status: AdapterStatus) => void>();
  const stateListeners = new Set<(state: VehicleConnectionState) => void>();
  const accumulator = new TelemetryAccumulator();

  let status: AdapterStatus = { state: "idle" };
  let handle: BleDeviceHandle | undefined;
  let connection: BleConnection | undefined;
  let session: G3Session | undefined;
  let stopDropListener: (() => void) | undefined;
  let pollTimer: unknown;
  let retryTimer: unknown;
  /** True from a tap on Connect until Disconnect: the rider wants this link. */
  let wanted = false;
  /** Changes on every start and stop, so a late result from an old attempt is ignored. */
  let epoch = 0;
  let disposed = false;

  const setStatus = (state: VehicleConnectionState, detail?: StatusDetail): void => {
    const previous = status;
    if (previous.state === state && previous.detail === detail) return;
    status = detail === undefined ? { state } : { state, detail };
    for (const listener of statusListeners) listener(status);
    if (previous.state !== state) for (const listener of stateListeners) listener(state);
  };

  const randomBytes: RandomBytes =
    options.randomBytes ??
    ((length) => {
      const scope = globalThis as {
        crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
      };
      const fill = scope.crypto?.getRandomValues;
      if (fill === undefined) throw new Error("No secure random source");
      return fill.call(scope.crypto, new Uint8Array(length));
    });

  /** Stops polling and closes the link, and forgets every telemetry value. */
  const tearDownLink = (): void => {
    if (pollTimer !== undefined) timers.clearTimeout(pollTimer);
    pollTimer = undefined;
    stopDropListener?.();
    stopDropListener = undefined;
    session?.close();
    session = undefined;
    const closing = connection;
    connection = undefined;
    accumulator.clear();
    if (closing !== undefined) void closing.close().catch(() => undefined);
  };

  const emit = (): void => {
    const sample = accumulator.sample(clock.now());
    if (sample === undefined) return;
    for (const listener of telemetryListeners) listener(sample);
  };

  const readRegister = async (
    active: G3Session,
    key: RegisterKey,
    target: number,
  ): Promise<boolean> => {
    const register = READ_REGISTERS[key];
    const payload = await active.read(register, target);
    options.onRawRegister?.(key, payload);
    const decoded = decodeRegister(key, payload);
    if (decoded === undefined) return true;
    accumulator.update(key, decoded, clock.now());
    return true;
  };

  /** Finds which board answers telemetry reads, by asking for speed. */
  const probeTarget = async (active: G3Session): Promise<number | undefined> => {
    for (const target of READ_TARGETS) {
      try {
        await readRegister(active, "speed", target);
        return target;
      } catch (error) {
        if (!(error instanceof RequestTimeoutError)) throw error;
      }
    }
    return undefined;
  };

  const startPolling = (active: G3Session, target: number, mine: number): void => {
    let slowIndex = 0;
    let lastSlowAt = 0;
    let speedFailures = 0;
    const step = async (): Promise<void> => {
      if (mine !== epoch || active !== session) return;
      try {
        try {
          await readRegister(active, "speed", target);
          speedFailures = 0;
        } catch (error) {
          if (!(error instanceof RequestTimeoutError)) throw error;
          speedFailures += 1;
          if (speedFailures >= SPEED_FAILURES_BEFORE_DROP) {
            handleLinkLost(mine);
            return;
          }
        }
        if (clock.now() - lastSlowAt >= slowPollMs) {
          lastSlowAt = clock.now();
          const key = SLOW_REGISTERS[slowIndex % SLOW_REGISTERS.length];
          slowIndex += 1;
          if (key !== undefined) {
            try {
              await readRegister(active, key, target);
            } catch (error) {
              if (!(error instanceof RequestTimeoutError)) throw error;
            }
          }
        }
        if (mine !== epoch || active !== session) return;
        emit();
        if (active.needsRenewal) {
          handleLinkLost(mine, true);
          return;
        }
      } catch (error) {
        if (error instanceof SessionClosedError) return;
        if (error instanceof CounterExhaustedError) {
          handleLinkLost(mine, true);
          return;
        }
        handleLinkLost(mine);
        return;
      }
      if (mine === epoch && active === session) {
        pollTimer = timers.setTimeout(() => void step(), fastPollMs);
      }
    };
    pollTimer = timers.setTimeout(() => void step(), 0);
  };

  /** Opens the link, sets up the session and gets the first telemetry. */
  const establish = async (allowPairing: boolean, mine: number): Promise<EstablishResult> => {
    const device = handle;
    if (device === undefined) return { kind: "failed", detail: "connect-failed" };
    setStatus("connecting");
    let opened: BleConnection;
    try {
      opened = await device.connect();
    } catch {
      return mine === epoch ? { kind: "failed", detail: "connect-failed" } : { kind: "cancelled" };
    }
    if (mine !== epoch) {
      void opened.close().catch(() => undefined);
      return { kind: "cancelled" };
    }
    connection = opened;
    stopDropListener = opened.onDisconnect(() => {
      if (connection === opened) handleLinkLost(mine);
    });
    setStatus("authenticating");

    const active = new G3Session({
      connection: opened,
      deviceName: device.name,
      subtle: options.subtle ?? requireSubtle(),
      timers,
      randomBytes,
      ...(options.requestTimeoutMs !== undefined
        ? { requestTimeoutMs: options.requestTimeoutMs }
        : {}),
      ...(options.pieceGapMs !== undefined ? { pieceGapMs: options.pieceGapMs } : {}),
      ...(options.pairingTimeoutMs !== undefined
        ? { pairingTimeoutMs: options.pairingTimeoutMs }
        : {}),
      ...(options.pairingRetryMs !== undefined ? { pairingRetryMs: options.pairingRetryMs } : {}),
    });
    session = active;

    try {
      const outcome = await active.handshake({
        credential: options.credentials.load(device.name),
        allowPairing,
      });
      if (mine !== epoch) return { kind: "cancelled" };
      if (outcome.kind === "auth-needed") {
        if (outcome.explicit) options.credentials.clear(device.name);
        tearDownLink();
        return { kind: "auth-needed", reason: outcome.reason };
      }
      options.credentials.save(device.name, outcome.password);

      const target = await probeTarget(active);
      if (mine !== epoch) return { kind: "cancelled" };
      if (target === undefined) {
        tearDownLink();
        return { kind: "failed", detail: "no-telemetry" };
      }
      emit();
      setStatus("connected");
      startPolling(active, target, mine);
      return { kind: "connected" };
    } catch (error) {
      if (mine !== epoch) return { kind: "cancelled" };
      tearDownLink();
      if (error instanceof RequestTimeoutError) return { kind: "failed", detail: "no-answer" };
      if (error instanceof SessionClosedError) return { kind: "failed", detail: "link-lost" };
      if (error instanceof ProtocolError) return { kind: "failed", detail: "protocol" };
      return { kind: "failed", detail: "protocol" };
    }
  };

  const scheduleRetry = (attempt: number, mine: number, immediate = false): void => {
    if (mine !== epoch || !wanted || handle === undefined) return;
    const delay = immediate ? 0 : retryDelays[attempt];
    if (delay === undefined || !isActive()) {
      setStatus("disconnected", "needs-tap");
      return;
    }
    retryTimer = timers.setTimeout(() => {
      retryTimer = undefined;
      if (mine !== epoch || !wanted) return;
      if (!isActive()) {
        setStatus("disconnected", "needs-tap");
        return;
      }
      void establish(false, mine).then((result) => {
        if (mine !== epoch) return;
        if (result.kind === "auth-needed") setStatus("auth-needed", result.reason);
        else if (result.kind === "failed") scheduleRetry(attempt + 1, mine);
      });
    }, delay);
  };

  function handleLinkLost(mine: number, immediate = false): void {
    if (mine !== epoch || disposed) return;
    // A new epoch makes any attempt still waiting on the old link stand down.
    epoch += 1;
    tearDownLink();
    setStatus("disconnected", "link-lost");
    // A link that was only renewed (the counter) retries at once, a lost one backs off.
    if (wanted) scheduleRetry(0, epoch, immediate);
  }

  const begin = async (allowPairing: boolean): Promise<void> => {
    if (disposed) return;
    if (status.state === "connecting" || status.state === "authenticating") return;
    const support = options.transport.support();
    if (!support.supported) {
      setStatus("unsupported", support.reason);
      return;
    }
    epoch += 1;
    const mine = epoch;
    wanted = true;
    if (retryTimer !== undefined) timers.clearTimeout(retryTimer);
    retryTimer = undefined;
    tearDownLink();

    // Reuse the scooter that was already picked when pairing or retrying after a drop. A first
    // connect, or one after Disconnect, shows the chooser (this call is from a tap).
    const reuse = handle !== undefined && (allowPairing || status.state !== "idle");
    if (!reuse) {
      setStatus("connecting");
      try {
        handle = await options.transport.requestDevice();
      } catch (error) {
        if (mine !== epoch) return;
        wanted = false;
        if (error instanceof ChooserCancelledError) {
          setStatus(handle === undefined ? "idle" : "disconnected", "chooser-cancelled");
        } else {
          setStatus("error", "connect-failed");
        }
        return;
      }
      if (mine !== epoch) return;
    }

    const result = await establish(allowPairing, mine);
    if (mine !== epoch) return;
    switch (result.kind) {
      case "connected":
      case "cancelled":
        return;
      case "auth-needed":
        wanted = false;
        setStatus("auth-needed", result.reason);
        return;
      case "failed":
        // The picked scooter may be wrong or gone, so the next tap shows the chooser again.
        handle = undefined;
        wanted = false;
        setStatus("error", result.detail);
        return;
    }
  };

  const adapter: BluetoothVehicleAdapter = {
    info,
    capabilities,
    connect: () => begin(false),
    pair: () => begin(true),

    async disconnect() {
      epoch += 1;
      wanted = false;
      if (retryTimer !== undefined) timers.clearTimeout(retryTimer);
      retryTimer = undefined;
      tearDownLink();
      handle = undefined;
      if (status.state !== "unsupported") setStatus("disconnected");
    },

    getConnectionState: () => status.state,
    getStatus: () => status,

    onTelemetry(listener) {
      telemetryListeners.add(listener);
      return () => {
        telemetryListeners.delete(listener);
      };
    },
    onConnectionStateChange(listener) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    onStatusChange(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },

    forgetPairing() {
      if (handle !== undefined) options.credentials.clear(handle.name);
    },

    retryNow() {
      if (disposed || !wanted || handle === undefined) return;
      if (status.state !== "disconnected") return;
      if (retryTimer !== undefined) timers.clearTimeout(retryTimer);
      retryTimer = undefined;
      scheduleRetry(0, epoch);
    },

    dispose() {
      void adapter.disconnect();
      disposed = true;
      telemetryListeners.clear();
      statusListeners.clear();
      stateListeners.clear();
    },
  };

  return adapter;

  function requireSubtle(): SubtleLike {
    const subtle = defaultSubtle();
    if (subtle === undefined) throw new ProtocolError("no WebCrypto");
    return subtle;
  }
}
