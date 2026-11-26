import { systemClock, type Clock } from "@waylit/core";
import { asciiBytes, concatBytes, equalBytes, writeUintLE } from "./bytes";
import {
  FrameCryptoError,
  decryptCounterMode,
  decryptCounterZero,
  defaultSubtle,
  deriveKey,
  encryptCounterMode,
  encryptCounterZero,
  type AesKey,
  type SubtleLike,
} from "./crypto";
import { FrameReassembler, fragment, layoutFrame, parseFrame, type Frame } from "./frame";
import {
  APP_ADDRESS,
  HANDSHAKE_AUTHENTICATE,
  HANDSHAKE_FIRST_CONTACT,
  HANDSHAKE_PAIR,
  READ_COMMAND,
  READ_REPLY_COMMAND,
} from "./guard";
import { findReadRegister, type RegisterKey } from "./registers";
import { G3_SCALES } from "./telemetry";
import {
  defaultTimers,
  type BleConnection,
  type BleDeviceHandle,
  type BleTransport,
  type Timers,
} from "./transport";
import type { Unsubscribe } from "../types";

/**
 * A desk simulator: a fake Bluetooth transport with a pretend scooter behind it. It speaks the
 * same frames as the adapter expects (handshake, then read replies), so the real parser, the real
 * crypto layer and the real adapter all run, with no hardware. It is for development and tests
 * only (`?vehicle=g3sim`), and everything it knows is invented: the name, the serial number, the
 * authentication parameter and the ride.
 *
 * It is a model made from the same unverified protocol description as the adapter, so a pass here
 * proves the code is consistent with that description, not that a real G3 agrees with it.
 */

export interface G3SimulatorOptions {
  readonly clock?: Clock;
  readonly timers?: Timers;
  readonly subtle?: SubtleLike;
  /** Delay before each reply, in milliseconds. Default 30. */
  readonly latencyMs?: number;
  /** Pairing requests answered with "pending" before one is accepted. Default 1. */
  readonly pendingPairings?: number;
  /** Start with a pairing already stored on the pretend scooter. Default false. */
  readonly password?: Uint8Array;
  /** The board that answers reads. Default 0x09. */
  readonly answerTarget?: number;
  /** A fixed warning code to report, for the warning display. Default none. */
  readonly warningCode?: number;
  /** A fixed speed in km/h instead of the generated ride. */
  readonly fixedSpeedKmh?: number;
  /** Answer the authentication step with "refused", to exercise that path. */
  readonly refuseAuth?: boolean;
}

export interface G3Simulator {
  readonly transport: BleTransport;
  /** Drops the link, as if the scooter went out of range. */
  dropLink(): void;
  /** Overrides the ride with a fixed speed in km/h, or goes back to the generated ride. */
  setSpeedKmh(kmh: number | undefined): void;
  /** True once the pretend scooter holds a pairing. */
  isPaired(): boolean;
  /** Pieces written by the app, so tests can inspect what was sent. */
  readonly writes: readonly Uint8Array[];
  /** Every request the pretend scooter understood, so tests can check nothing else was sent. */
  readonly received: readonly { target: number; command: number; index: number }[];
}

const SIM_NAME = "NB-DESKSIM";
const SIM_SERIAL = "DESKSIM0000001";
const SIM_AUTH_PARAM = Uint8Array.from([
  0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xf0, 0x01,
]);
const PIECE = 20;

export function createG3Simulator(options: G3SimulatorOptions = {}): G3Simulator {
  const clock = options.clock ?? systemClock;
  const timers = options.timers ?? defaultTimers;
  const latencyMs = options.latencyMs ?? 30;
  const answerTarget = options.answerTarget ?? 0x09;
  const writes: Uint8Array[] = [];
  const received: { target: number; command: number; index: number }[] = [];
  const note = (request: Frame): void => {
    received.push({ target: request.target, command: request.command, index: request.index });
  };
  let pendingPairings = options.pendingPairings ?? 1;
  let password: Uint8Array | undefined = options.password;
  let overrideKmh: number | undefined = options.fixedSpeedKmh;
  let current: SimLink | undefined;

  const subtle = (): SubtleLike => {
    const found = options.subtle ?? defaultSubtle();
    if (found === undefined) throw new Error("No WebCrypto");
    return found;
  };

  /** Rider model: a repeating 80 second ride, to give the HUD something to show. */
  const ride = { startedAt: 0, lastAt: 0, tripMetres: 0, battery: 87 };
  const speedKmhAt = (nowMs: number): number => {
    if (overrideKmh !== undefined) return overrideKmh;
    const t = ((nowMs - ride.startedAt) / 1000) % 80;
    if (t < 10) return (t / 10) * 20;
    if (t < 55) return 20 + Math.sin(t) * 0.6;
    if (t < 65) return ((65 - t) / 10) * 20;
    return 0;
  };
  const advanceRide = (nowMs: number): number => {
    const kmh = speedKmhAt(nowMs);
    const dt = Math.max(0, (nowMs - ride.lastAt) / 1000);
    ride.lastAt = nowMs;
    ride.tripMetres += (kmh / 3.6) * dt;
    ride.battery = Math.max(5, ride.battery - (dt * kmh) / 3.6 / 900);
    return kmh;
  };

  const registerValue = (key: RegisterKey, nowMs: number): Uint8Array => {
    const kmh = advanceRide(nowMs);
    switch (key) {
      case "speed":
        return writeUintLE(Math.round(kmh / G3_SCALES.speedKmhPerUnit), 2);
      case "battery":
        return writeUintLE(Math.round(ride.battery), 2);
      case "totalMileage":
        return writeUintLE(4_321_000 + ride.tripMetres, 4);
      case "tripMileage":
        return writeUintLE(ride.tripMetres / G3_SCALES.tripMileageMetresPerUnit, 2);
      case "range":
        return writeUintLE((ride.battery * 620) / G3_SCALES.rangeMetresPerUnit, 2);
      case "gearMode":
        return writeUintLE(2, 2);
      case "temperature":
        return writeUintLE(Math.round(24.5 / G3_SCALES.temperatureCelsiusPerUnit), 2);
      case "errorCode":
        return writeUintLE(0, 2);
      case "warningCode":
        return writeUintLE(options.warningCode ?? 0, 2);
    }
  };

  class SimLink {
    private readonly reassembler = new FrameReassembler();
    private readonly notifyListeners = new Set<(piece: Uint8Array) => void>();
    private readonly disconnectListeners = new Set<() => void>();
    private chain: Promise<void> = Promise.resolve();
    private lastRx = 0;
    private txCounter = 0;
    private firstKey: AesKey | undefined;
    private pairKey: AesKey | undefined;
    private sessionKey: AesKey | undefined;
    private open = true;

    write(piece: Uint8Array): void {
      writes.push(piece.slice());
      for (const wire of this.reassembler.push(piece)) {
        this.chain = this.chain.then(() => this.handle(wire)).catch(() => undefined);
      }
    }

    onNotify(listener: (piece: Uint8Array) => void): Unsubscribe {
      this.notifyListeners.add(listener);
      return () => {
        this.notifyListeners.delete(listener);
      };
    }

    onDisconnect(listener: () => void): Unsubscribe {
      this.disconnectListeners.add(listener);
      return () => {
        this.disconnectListeners.delete(listener);
      };
    }

    drop(): void {
      if (!this.open) return;
      this.open = false;
      const listeners = [...this.disconnectListeners];
      this.disconnectListeners.clear();
      this.notifyListeners.clear();
      for (const listener of listeners) listener();
    }

    private async handle(wire: Uint8Array): Promise<void> {
      if (!this.open) return;
      const name = asciiBytes(SIM_NAME);
      this.firstKey ??= await deriveKey(subtle(), name);

      // First contact arrives in counter 0 mode.
      try {
        const first = await decryptCounterZero(this.firstKey, wire);
        const request = parseFrame(first.plain);
        note(request);
        if (request.command === HANDSHAKE_FIRST_CONTACT) {
          this.pairKey = await deriveKey(subtle(), name, SIM_AUTH_PARAM);
          this.reply(
            request,
            concatBytes(SIM_AUTH_PARAM, asciiBytes(SIM_SERIAL)),
            password === undefined ? 0 : 1,
            "zero",
          );
        }
        return;
      } catch (error) {
        if (!(error instanceof FrameCryptoError)) throw error;
      }

      // Everything after that is counter mode, under the pairing key or the session key.
      const sessionKey = password === undefined ? undefined : await this.passwordKey(password);
      const candidates: [AesKey, "pair" | "session"][] = [];
      if (sessionKey !== undefined) candidates.push([sessionKey, "session"]);
      if (this.pairKey !== undefined) candidates.push([this.pairKey, "pair"]);
      for (const [key, which] of candidates) {
        let decrypted;
        try {
          decrypted = await decryptCounterMode(key, SIM_AUTH_PARAM, wire);
        } catch (error) {
          if (error instanceof FrameCryptoError) continue;
          throw error;
        }
        if (decrypted.counter <= this.lastRx) return; // replay
        this.lastRx = decrypted.counter;
        const request = parseFrame(decrypted.plain);
        note(request);
        if (which === "pair") await this.onPair(request);
        else await this.onSession(request, key);
        return;
      }
    }

    private async passwordKey(secret: Uint8Array): Promise<AesKey> {
      return deriveKey(subtle(), secret, SIM_AUTH_PARAM);
    }

    private async onPair(request: Frame): Promise<void> {
      if (request.command !== HANDSHAKE_PAIR) return;
      if (pendingPairings > 0) {
        pendingPairings -= 1;
        this.reply(request, new Uint8Array(0), 0, "pair");
        return;
      }
      password = request.payload.slice();
      this.reply(request, new Uint8Array(0), 1, "pair");
    }

    private async onSession(request: Frame, key: AesKey): Promise<void> {
      this.sessionKey = key;
      if (request.command === HANDSHAKE_AUTHENTICATE) {
        const ok =
          options.refuseAuth !== true && equalBytes(request.payload, asciiBytes(SIM_SERIAL));
        this.reply(request, new Uint8Array(0), ok ? 1 : 0, "session");
        return;
      }
      if (request.command !== READ_COMMAND || request.target !== answerTarget) return;
      const register = findReadRegister(request.index);
      if (register === undefined) return;
      const value = registerValue(register.key, clock.now());
      this.reply(request, value.slice(0, register.size), request.index, "session", true);
    }

    private reply(
      request: Frame,
      payload: Uint8Array,
      index: number,
      mode: "zero" | "pair" | "session",
      isRead = false,
    ): void {
      const frame: Frame = {
        source: request.target,
        target: APP_ADDRESS,
        command: isRead ? READ_REPLY_COMMAND : request.command,
        index,
        payload,
      };
      const plain = layoutFrame(frame);
      void (async () => {
        let wire: Uint8Array;
        if (mode === "zero") {
          const key = this.firstKey;
          if (key === undefined) return;
          wire = await encryptCounterZero(key, plain);
        } else {
          const key = mode === "pair" ? this.pairKey : this.sessionKey;
          if (key === undefined) return;
          this.txCounter += 1;
          wire = await encryptCounterMode(key, SIM_AUTH_PARAM, this.txCounter, plain);
        }
        timers.setTimeout(() => {
          if (!this.open) return;
          for (const piece of fragment(wire, PIECE)) {
            for (const listener of this.notifyListeners) listener(piece.slice());
          }
        }, latencyMs);
      })();
    }
  }

  const connect = async (): Promise<BleConnection> => {
    current?.drop();
    const link = new SimLink();
    current = link;
    ride.startedAt = clock.now();
    ride.lastAt = ride.startedAt;
    return {
      writePieceSize: PIECE,
      async write(piece) {
        link.write(piece);
      },
      onNotify: (listener) => link.onNotify(listener),
      onDisconnect: (listener) => link.onDisconnect(listener),
      async close() {
        link.drop();
      },
    };
  };

  return {
    transport: {
      support: () => ({ supported: true }),
      async requestDevice(): Promise<BleDeviceHandle> {
        return { name: SIM_NAME, connect };
      },
    },
    dropLink: () => {
      current?.drop();
    },
    setSpeedKmh: (kmh) => {
      overrideKmh = kmh;
    },
    isPaired: () => password !== undefined,
    writes,
    received,
  };
}
