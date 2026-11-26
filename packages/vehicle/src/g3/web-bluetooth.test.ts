import { describe, expect, it } from "vitest";
import { bytesToHex } from "./bytes";
import { ChooserCancelledError } from "./transport";
import {
  ALLOWED_UUIDS,
  NOTIFY_CHARACTERISTIC_UUID,
  SERVICE_UUID,
  WRITE_CHARACTERISTIC_UUID,
  createWebBluetoothTransport,
  detectSupport,
  type BluetoothLike,
  type BrowserEnvironment,
} from "./web-bluetooth";

type Handler = (event: unknown) => void;

class FakeEmitter {
  readonly handlers = new Map<string, Set<Handler>>();
  addEventListener(type: string, handler: Handler): void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(type, set);
  }
  removeEventListener(type: string, handler: Handler): void {
    this.handlers.get(type)?.delete(handler);
  }
  emit(type: string, event: unknown = {}): void {
    for (const handler of [...(this.handlers.get(type) ?? [])]) handler(event);
  }
  count(type: string): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}

class FakeCharacteristic extends FakeEmitter {
  readonly writes: string[] = [];
  started = false;
  stopped = false;
  properties: { write?: boolean; writeWithoutResponse?: boolean } = { write: true };
  async writeValueWithResponse(value: Uint8Array) {
    this.writes.push(`with:${bytesToHex(value)}`);
  }
  async writeValueWithoutResponse(value: Uint8Array) {
    this.writes.push(`without:${bytesToHex(value)}`);
  }
  async startNotifications() {
    this.started = true;
    return this;
  }
  async stopNotifications() {
    this.stopped = true;
    return this;
  }
}

function fakeBrowser(name: string | undefined = "NB-FAKE") {
  const write = new FakeCharacteristic();
  const notify = new FakeCharacteristic();
  const asked: string[] = [];
  const device = Object.assign(new FakeEmitter(), {
    name,
    gatt: {
      connected: false,
      async connect() {
        this.connected = true;
        return this;
      },
      disconnect() {
        this.connected = false;
      },
      async getPrimaryService(uuid: string) {
        asked.push(`service:${uuid}`);
        return {
          async getCharacteristic(characteristic: string) {
            asked.push(`characteristic:${characteristic}`);
            return characteristic === WRITE_CHARACTERISTIC_UUID ? write : notify;
          },
        };
      },
    },
  });
  const requests: unknown[] = [];
  const bluetooth: BluetoothLike = {
    async requestDevice(options) {
      requests.push(options);
      return device;
    },
  };
  return { device, write, notify, asked, requests, bluetooth };
}

const secureEnv = (bluetooth: BluetoothLike | undefined): BrowserEnvironment => ({
  bluetooth,
  isSecureContext: true,
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
  platform: "Linux armv81",
  maxTouchPoints: 5,
});

describe("detectSupport", () => {
  const bt = fakeBrowser().bluetooth;
  it("is supported on a secure Android page with Web Bluetooth", () => {
    expect(detectSupport(secureEnv(bt))).toEqual({ supported: true });
  });
  it("reports no Web Bluetooth", () => {
    expect(detectSupport(secureEnv(undefined))).toEqual({
      supported: false,
      reason: "no-web-bluetooth",
    });
  });
  it("reports an insecure page", () => {
    expect(detectSupport({ ...secureEnv(bt), isSecureContext: false })).toEqual({
      supported: false,
      reason: "insecure-context",
    });
  });
  it("reports iOS first, including an iPad that looks like a Mac", () => {
    expect(
      detectSupport({ ...secureEnv(bt), userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" }),
    ).toEqual({ supported: false, reason: "ios" });
    expect(
      detectSupport({ ...secureEnv(bt), userAgent: "Macintosh", platform: "MacIntel" }),
    ).toEqual({ supported: false, reason: "ios" });
    expect(
      detectSupport({ ...secureEnv(undefined), userAgent: "iPhone", isSecureContext: false }),
    ).toEqual({ supported: false, reason: "ios" });
  });
});

describe("web bluetooth transport", () => {
  it("asks only for NB named devices and the one allowed service", async () => {
    const f = fakeBrowser();
    await createWebBluetoothTransport(() => secureEnv(f.bluetooth)).requestDevice();
    expect(f.requests).toEqual([
      { filters: [{ namePrefix: "NB" }], optionalServices: [SERVICE_UUID] },
    ]);
  });

  it("turns a closed chooser into ChooserCancelledError", async () => {
    const f = fakeBrowser();
    const bluetooth: BluetoothLike = {
      async requestDevice() {
        throw Object.assign(new Error("none"), { name: "NotFoundError" });
      },
    };
    void f;
    await expect(
      createWebBluetoothTransport(() => secureEnv(bluetooth)).requestDevice(),
    ).rejects.toBeInstanceOf(ChooserCancelledError);
  });

  it("refuses a device that does not have an NB name", async () => {
    const f = fakeBrowser("Something Else");
    await expect(
      createWebBluetoothTransport(() => secureEnv(f.bluetooth)).requestDevice(),
    ).rejects.toThrow();
  });

  it("refuses to run where Web Bluetooth is not available", async () => {
    await expect(
      createWebBluetoothTransport(() => secureEnv(undefined)).requestDevice(),
    ).rejects.toThrow();
  });

  it("touches only the service, the write and the notify characteristic", async () => {
    const f = fakeBrowser();
    const handle = await createWebBluetoothTransport(() => secureEnv(f.bluetooth)).requestDevice();
    await handle.connect();
    expect(f.asked.sort()).toEqual(
      [
        `service:${SERVICE_UUID}`,
        `characteristic:${WRITE_CHARACTERISTIC_UUID}`,
        `characteristic:${NOTIFY_CHARACTERISTIC_UUID}`,
      ].sort(),
    );
    expect(ALLOWED_UUIDS).toHaveLength(3);
  });

  it("subscribes to notifications and passes pieces on as copies", async () => {
    const f = fakeBrowser();
    const handle = await createWebBluetoothTransport(() => secureEnv(f.bluetooth)).requestDevice();
    const connection = await handle.connect();
    expect(f.notify.started).toBe(true);
    const seen: string[] = [];
    connection.onNotify((piece) => seen.push(bytesToHex(piece)));
    const view = new DataView(Uint8Array.from([9, 1, 2, 3, 9]).buffer, 1, 3);
    f.notify.emit("characteristicvaluechanged", { target: { value: view } });
    expect(seen).toEqual(["010203"]);
  });

  it("writes with response when it can, without when the characteristic only allows that", async () => {
    const f = fakeBrowser();
    const handle = await createWebBluetoothTransport(() => secureEnv(f.bluetooth)).requestDevice();
    const connection = await handle.connect();
    await connection.write(Uint8Array.of(1, 2));
    f.write.properties = { write: false, writeWithoutResponse: true };
    await connection.write(Uint8Array.of(3));
    expect(f.write.writes).toEqual(["with:0102", "without:03"]);
    expect(connection.writePieceSize).toBe(20);
  });

  it("reports a drop once, and removes its listeners on close", async () => {
    const f = fakeBrowser();
    const handle = await createWebBluetoothTransport(() => secureEnv(f.bluetooth)).requestDevice();
    const connection = await handle.connect();
    let drops = 0;
    connection.onDisconnect(() => drops++);
    f.device.emit("gattserverdisconnected");
    f.device.emit("gattserverdisconnected");
    expect(drops).toBe(1);
    expect(f.device.count("gattserverdisconnected")).toBe(0);
    expect(f.notify.count("characteristicvaluechanged")).toBe(0);
    await expect(connection.write(Uint8Array.of(1))).rejects.toThrow();
  });

  it("close stops notifications, disconnects and fires the disconnect listener", async () => {
    const f = fakeBrowser();
    const handle = await createWebBluetoothTransport(() => secureEnv(f.bluetooth)).requestDevice();
    const connection = await handle.connect();
    let drops = 0;
    connection.onDisconnect(() => drops++);
    await connection.close();
    await connection.close();
    expect(f.notify.stopped).toBe(true);
    expect(f.device.gatt.connected).toBe(false);
    expect(drops).toBe(1);
    expect(f.notify.count("characteristicvaluechanged")).toBe(0);
  });

  it("cleans up when connecting fails part way", async () => {
    const f = fakeBrowser();
    f.device.gatt.getPrimaryService = async () => {
      throw new Error("no service");
    };
    const handle = await createWebBluetoothTransport(() => secureEnv(f.bluetooth)).requestDevice();
    await expect(handle.connect()).rejects.toThrow("no service");
    expect(f.device.count("gattserverdisconnected")).toBe(0);
    expect(f.device.gatt.connected).toBe(false);
  });
});
