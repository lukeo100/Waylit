import type { Unsubscribe } from "../types";
import {
  ChooserCancelledError,
  type BleConnection,
  type BleDeviceHandle,
  type BleTransport,
  type TransportSupport,
} from "./transport";

/**
 * The Web Bluetooth side of `BleTransport`. It is typed against the small shapes below instead of
 * the DOM types, so the package has no DOM dependency and tests can pass a fake `navigator`.
 *
 * What it asks the browser for is deliberately narrow:
 *
 * - the chooser only lists devices whose name starts with "NB", and
 * - the only service it may use is the scooter's own service, and within it only the write
 *   characteristic and the notify characteristic. No other service or characteristic UUID is
 *   named anywhere in this package.
 *
 * Browser limits that shape the design (see docs/PWA.md): connecting needs HTTPS and a tap,
 * `getDevices` and advertisement watching are not reliable on Android, so the chooser is shown
 * each session, and a screen that is off drops the link. iOS Safari has no Web Bluetooth.
 */

/** The advertised name must start with this. */
export const DEVICE_NAME_PREFIX = "NB";
/** The one service the app may use. */
export const SERVICE_UUID = "6e400001-0000-0000-006e-696e65626f74";
/** Requests are written here. */
export const WRITE_CHARACTERISTIC_UUID = "6e400002-0000-0000-006e-696e65626f74";
/** Replies arrive here as notifications. */
export const NOTIFY_CHARACTERISTIC_UUID = "6e400004-0000-0000-006e-696e65626f74";
/** Every UUID the app may use, for tests and docs. */
export const ALLOWED_UUIDS: readonly string[] = [
  SERVICE_UUID,
  WRITE_CHARACTERISTIC_UUID,
  NOTIFY_CHARACTERISTIC_UUID,
];

/** Used when the browser does not say what size a write may be. The Bluetooth default MTU of 23 minus 3. */
export const DEFAULT_WRITE_PIECE_SIZE = 20;

type Listener = (event: unknown) => void;

interface EventSourceLike {
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
}

interface CharacteristicLike extends EventSourceLike {
  readonly properties?: { readonly write?: boolean; readonly writeWithoutResponse?: boolean };
  writeValueWithResponse?(value: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array): Promise<void>;
  writeValue?(value: Uint8Array): Promise<void>;
  startNotifications(): Promise<unknown>;
  stopNotifications?(): Promise<unknown>;
}

interface ServiceLike {
  getCharacteristic(uuid: string): Promise<CharacteristicLike>;
}

interface GattServerLike {
  readonly connected: boolean;
  connect(): Promise<GattServerLike>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<ServiceLike>;
}

interface BluetoothDeviceLike extends EventSourceLike {
  readonly name?: string | undefined;
  readonly gatt?: GattServerLike | undefined;
}

export interface BluetoothLike {
  requestDevice(options: {
    filters: readonly { namePrefix: string }[];
    optionalServices: readonly string[];
  }): Promise<BluetoothDeviceLike>;
}

/** The parts of `navigator` and `window` that decide whether Bluetooth can be used. */
export interface BrowserEnvironment {
  readonly bluetooth?: BluetoothLike | undefined;
  readonly isSecureContext?: boolean | undefined;
  readonly userAgent?: string | undefined;
  readonly platform?: string | undefined;
  readonly maxTouchPoints?: number | undefined;
}

/** Why Bluetooth cannot be used here, or `supported`. */
export function detectSupport(env: BrowserEnvironment): TransportSupport {
  const ua = env.userAgent ?? "";
  const iPadOnDesktopUserAgent = env.platform === "MacIntel" && (env.maxTouchPoints ?? 0) > 1;
  if (/iPad|iPhone|iPod/.test(ua) || iPadOnDesktopUserAgent) {
    return { supported: false, reason: "ios" };
  }
  if (env.isSecureContext === false) return { supported: false, reason: "insecure-context" };
  if (env.bluetooth === undefined) return { supported: false, reason: "no-web-bluetooth" };
  return { supported: true };
}

/** Reads the browser's own environment. Returns an empty one on the server. */
export function browserEnvironment(): BrowserEnvironment {
  const scope = globalThis as {
    navigator?: {
      bluetooth?: BluetoothLike;
      userAgent?: string;
      platform?: string;
      maxTouchPoints?: number;
    };
    isSecureContext?: boolean;
  };
  const nav = scope.navigator;
  return {
    bluetooth: nav?.bluetooth,
    isSecureContext: scope.isSecureContext,
    userAgent: nav?.userAgent,
    platform: nav?.platform,
    maxTouchPoints: nav?.maxTouchPoints,
  };
}

export function createWebBluetoothTransport(
  getEnvironment: () => BrowserEnvironment = browserEnvironment,
): BleTransport {
  return {
    support: () => detectSupport(getEnvironment()),

    async requestDevice(): Promise<BleDeviceHandle> {
      const env = getEnvironment();
      const support = detectSupport(env);
      if (!support.supported || env.bluetooth === undefined) {
        throw new Error("Web Bluetooth is not available");
      }
      let device: BluetoothDeviceLike;
      try {
        device = await env.bluetooth.requestDevice({
          filters: [{ namePrefix: DEVICE_NAME_PREFIX }],
          optionalServices: [SERVICE_UUID],
        });
      } catch (error) {
        // Closing the chooser rejects with NotFoundError. It is not a failure.
        if ((error as { name?: string } | null)?.name === "NotFoundError") {
          throw new ChooserCancelledError();
        }
        throw error;
      }
      const name = device.name;
      if (name === undefined || !name.startsWith(DEVICE_NAME_PREFIX)) {
        throw new Error("The picked device has no usable name");
      }
      return { name, connect: () => openConnection(device) };
    },
  };
}

async function openConnection(device: BluetoothDeviceLike): Promise<BleConnection> {
  const gatt = device.gatt;
  if (gatt === undefined) throw new Error("The device has no GATT server");

  const notifyListeners = new Set<(piece: Uint8Array) => void>();
  const disconnectListeners = new Set<() => void>();
  let open = true;

  const onValue: Listener = (event) => {
    const value = (event as { target?: { value?: DataView } }).target?.value;
    if (value === undefined) return;
    const piece = new Uint8Array(value.byteLength);
    piece.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    for (const listener of notifyListeners) listener(piece);
  };
  const onDisconnected: Listener = () => {
    finish();
  };
  const finish = (): void => {
    if (!open) return;
    open = false;
    device.removeEventListener("gattserverdisconnected", onDisconnected);
    notify?.removeEventListener("characteristicvaluechanged", onValue);
    const listeners = [...disconnectListeners];
    notifyListeners.clear();
    disconnectListeners.clear();
    for (const listener of listeners) listener();
  };

  let notify: CharacteristicLike | undefined;
  device.addEventListener("gattserverdisconnected", onDisconnected);
  try {
    const server = await gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const write = await service.getCharacteristic(WRITE_CHARACTERISTIC_UUID);
    notify = await service.getCharacteristic(NOTIFY_CHARACTERISTIC_UUID);
    // Listen before subscribing, so the first notification cannot be missed.
    notify.addEventListener("characteristicvaluechanged", onValue);
    await notify.startNotifications();

    return {
      writePieceSize: DEFAULT_WRITE_PIECE_SIZE,
      async write(piece) {
        if (!open) throw new Error("The link is closed");
        if (write.properties?.write !== false && write.writeValueWithResponse) {
          await write.writeValueWithResponse(piece);
        } else if (write.writeValueWithoutResponse) {
          await write.writeValueWithoutResponse(piece);
        } else if (write.writeValue) {
          await write.writeValue(piece);
        } else {
          throw new Error("The characteristic cannot be written");
        }
      },
      onNotify(listener): Unsubscribe {
        notifyListeners.add(listener);
        return () => {
          notifyListeners.delete(listener);
        };
      },
      onDisconnect(listener): Unsubscribe {
        if (!open) {
          void Promise.resolve().then(listener);
          return () => undefined;
        }
        disconnectListeners.add(listener);
        return () => {
          disconnectListeners.delete(listener);
        };
      },
      async close() {
        if (!open) return;
        try {
          await notify?.stopNotifications?.();
        } catch {
          // The link may already be gone.
        }
        try {
          if (gatt.connected) gatt.disconnect();
        } finally {
          finish();
        }
      },
    };
  } catch (error) {
    device.removeEventListener("gattserverdisconnected", onDisconnected);
    notify?.removeEventListener("characteristicvaluechanged", onValue);
    open = false;
    try {
      if (gatt.connected) gatt.disconnect();
    } catch {
      // Nothing to clean up.
    }
    throw error;
  }
}
