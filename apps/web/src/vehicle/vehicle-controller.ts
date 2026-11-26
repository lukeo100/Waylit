import {
  createG3Simulator,
  createWebBluetoothAdapter,
  createWebBluetoothTransport,
  type AdapterStatus,
  type BleTransport,
  type BluetoothVehicleAdapter,
  type CredentialStore,
  type RegisterKey,
  type VehicleAdapter,
} from "@waylit/vehicle";
import {
  readStoredVehicle,
  resolveVehicle,
  writeStoredVehicle,
  type VehicleChoice,
  type VehicleMode,
  type VehicleStorage,
} from "./vehicle-settings";

/**
 * Owns the vehicle adapter for the app. The riding screen only sees the plain `VehicleAdapter`
 * interface, through `getAdapter()`: undefined means the mock, which the ride session creates on
 * its own and which is the default.
 *
 * Nothing here opens Bluetooth until a method that comes from a tap (`connect`, `pair`) is
 * called, and `connect` and `pair` call the adapter in the same turn, so the browser still sees
 * the tap when it shows the chooser.
 */

export interface VehicleSnapshot {
  readonly mode: VehicleMode;
  readonly lockedByAddress: boolean;
  /** The status of the Bluetooth link. Always idle for the mock. */
  readonly status: AdapterStatus;
}

export interface VehicleController {
  getSnapshot(): VehicleSnapshot;
  subscribe(listener: () => void): () => void;
  /** The adapter the ride should listen to, or undefined for the mock. */
  getAdapter(): VehicleAdapter | undefined;
  /** Tells the ride when the adapter changes, so it can switch over. */
  onAdapterChange(listener: (adapter: VehicleAdapter | undefined) => void): () => void;
  setChoice(choice: VehicleChoice): void;
  connect(): Promise<void>;
  pair(): Promise<void>;
  disconnect(): Promise<void>;
  forgetPairing(): void;
  /** False while the screen is hidden or the trip is over, so lost links are not chased. */
  setSessionActive(active: boolean): void;
}

export interface VehicleControllerEnvironment {
  readonly search: string;
  readonly storage: VehicleStorage | null;
  readonly createTransport: () => BleTransport;
  /** Where the pairing is kept for a real scooter. */
  readonly credentials: CredentialStore;
  /** Raw register values, for calibration in development builds only. */
  readonly onRawRegister?: (key: RegisterKey, payload: Uint8Array) => void;
}

const IDLE: AdapterStatus = { state: "idle" };

export function createVehicleController(env: VehicleControllerEnvironment): VehicleController {
  const listeners = new Set<() => void>();
  const adapterListeners = new Set<(adapter: VehicleAdapter | undefined) => void>();
  let resolved = resolveVehicle(env.search, readStoredVehicle(env.storage));
  let adapter: BluetoothVehicleAdapter | undefined;
  let stopStatus: (() => void) | undefined;
  let sessionActive = true;
  let status: AdapterStatus = IDLE;
  let snapshot = buildSnapshot();

  function buildSnapshot(): VehicleSnapshot {
    return { mode: resolved.mode, lockedByAddress: resolved.lockedByAddress, status };
  }
  function publish(): void {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener();
  }

  /** Bluetooth support for the real scooter, known before any tap. */
  function supportStatus(): AdapterStatus | undefined {
    if (resolved.mode !== "g3") return undefined;
    const support = env.createTransport().support();
    return support.supported ? undefined : { state: "unsupported", detail: support.reason };
  }

  function dropAdapter(): void {
    stopStatus?.();
    stopStatus = undefined;
    adapter?.dispose();
    adapter = undefined;
  }

  function ensureAdapter(): BluetoothVehicleAdapter {
    if (adapter) return adapter;
    const simulator = resolved.mode === "g3sim" ? createG3Simulator() : undefined;
    const transport = simulator ? simulator.transport : env.createTransport();
    const created = createWebBluetoothAdapter({
      transport,
      // The simulator forgets its pairing on reload, so its pairing is not stored either.
      credentials: simulator ? memoryCredentials() : env.credentials,
      isSessionActive: () => sessionActive,
      ...(simulator ? { displayName: "Ninebot MAX G3 (desk simulator)", adapterId: "g3-sim" } : {}),
      ...(env.onRawRegister ? { onRawRegister: env.onRawRegister } : {}),
    });
    adapter = created;
    stopStatus = created.onStatusChange((next) => {
      status = next;
      publish();
    });
    return created;
  }

  /** Applies the resolved mode: builds or removes the adapter and tells the ride. */
  function apply(): void {
    dropAdapter();
    status = supportStatus() ?? IDLE;
    if (resolved.mode === "mock") {
      for (const listener of adapterListeners) listener(undefined);
    } else {
      const created = ensureAdapter();
      // The unsupported state is known without a tap, so the sheet can say so straight away.
      status = supportStatus() ?? created.getStatus();
      for (const listener of adapterListeners) listener(created);
    }
    publish();
  }

  if (resolved.mode !== "mock") {
    const created = ensureAdapter();
    status = supportStatus() ?? created.getStatus();
    snapshot = buildSnapshot();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getAdapter: () => adapter,
    onAdapterChange(listener) {
      adapterListeners.add(listener);
      return () => {
        adapterListeners.delete(listener);
      };
    },
    setChoice(choice) {
      if (resolved.lockedByAddress) return;
      writeStoredVehicle(env.storage, choice);
      if (resolved.mode === choice) return;
      resolved = { mode: choice, lockedByAddress: false };
      apply();
    },
    connect: () => ensureAdapter().connect(),
    pair: () => ensureAdapter().pair(),
    async disconnect() {
      await adapter?.disconnect();
    },
    forgetPairing() {
      adapter?.forgetPairing();
    },
    setSessionActive(active) {
      if (active === sessionActive) return;
      sessionActive = active;
      if (active) adapter?.retryNow();
    },
  };
}

/** A pairing store that lives only as long as the page. */
export function memoryCredentials(): CredentialStore {
  const map = new Map<string, Uint8Array>();
  return {
    load: (name) => map.get(name),
    save: (name, password) => {
      map.set(name, password.slice());
    },
    clear: (name) => {
      map.delete(name);
    },
  };
}

const CREDENTIAL_PREFIX = "waylit:g3:pairing:v1:";

/**
 * Keeps the pairing in this browser's localStorage, on this phone only (try/catch, so a blocked
 * store just means pairing is asked for again). The value is a random secret made on the phone
 * when the rider chooses to pair. It never leaves the device and is never logged.
 */
export function browserCredentials(getStorage: () => VehicleStorage | null): CredentialStore {
  const key = (name: string): string => `${CREDENTIAL_PREFIX}${name}`;
  return {
    load(name) {
      try {
        const raw = getStorage()?.getItem(key(name));
        if (!raw || !/^[0-9a-f]{32}$/.test(raw)) return undefined;
        const out = new Uint8Array(16);
        for (let i = 0; i < 16; i++) out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
        return out;
      } catch {
        return undefined;
      }
    },
    save(name, password) {
      try {
        const hex = Array.from(password, (b) => b.toString(16).padStart(2, "0")).join("");
        getStorage()?.setItem(key(name), hex);
      } catch {
        // Not remembered. Pairing is asked for again next time.
      }
    },
    clear(name) {
      try {
        const storage = getStorage() as (VehicleStorage & { removeItem?(k: string): void }) | null;
        storage?.removeItem?.(key(name));
      } catch {
        // Nothing to clear.
      }
    },
  };
}

/** The controller for the browser. */
export function createBrowserVehicleController(devRaw = false): VehicleController {
  const getStorage = (): Storage | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };
  return createVehicleController({
    search: window.location.search,
    storage: getStorage(),
    createTransport: () => createWebBluetoothTransport(),
    credentials: browserCredentials(getStorage),
    ...(devRaw
      ? {
          onRawRegister: (key: RegisterKey, payload: Uint8Array) => {
            console.debug("g3 raw", key, Array.from(payload));
          },
        }
      : {}),
  });
}

/** A controller for the server render and tests with no browser: always the mock. */
export function createInertVehicleController(): VehicleController {
  const snapshot: VehicleSnapshot = { mode: "mock", lockedByAddress: false, status: IDLE };
  const none = async (): Promise<void> => undefined;
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    getAdapter: () => undefined,
    onAdapterChange: () => () => undefined,
    setChoice: () => undefined,
    connect: none,
    pair: none,
    disconnect: none,
    forgetPairing: () => undefined,
    setSessionActive: () => undefined,
  };
}
