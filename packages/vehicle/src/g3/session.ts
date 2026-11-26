import { asciiBytes } from "./bytes";
import {
  FrameCryptoError,
  decryptCounterMode,
  decryptCounterZero,
  deriveKey,
  encryptCounterMode,
  encryptCounterZero,
  type AesKey,
  type SubtleLike,
} from "./crypto";
import { FrameReassembler, encodeRequest, fragment, parseFrame, type Frame } from "./frame";
import {
  APP_ADDRESS,
  BLE_BOARD,
  HANDSHAKE_AUTHENTICATE,
  HANDSHAKE_FIRST_CONTACT,
  HANDSHAKE_PAIR,
  READ_COMMAND,
  READ_REPLY_COMMAND,
  assertAllowedRequest,
} from "./guard";
import type { ReadRegister } from "./registers";
import type { BleConnection, Timers } from "./transport";

/**
 * One encrypted session with a scooter over an open `BleConnection`: the three step handshake,
 * then read requests. It writes one request at a time (GATT does not allow overlapping
 * operations) and matches each reply to its request by register number.
 *
 * It can only send what `guard.ts` allows: the handshake and reads of the allowlisted registers.
 * It never logs or exposes the advertised name, the serial number or the session password.
 */

export type RandomBytes = (length: number) => Uint8Array;

export type AuthNeededReason =
  /** This phone has no stored pairing for the scooter and pairing was not requested. */
  | "not-paired"
  /** The scooter refused the stored pairing, or the pairing step. */
  | "rejected"
  /** Pairing was asked for, but the scooter did not accept it in time. */
  | "pairing-timeout";

export type HandshakeOutcome =
  | { readonly kind: "authenticated"; readonly password: Uint8Array }
  | {
      readonly kind: "auth-needed";
      readonly reason: AuthNeededReason;
      /** True when the scooter said no, as opposed to the link just being slow. */
      readonly explicit: boolean;
    };

export interface HandshakeOptions {
  /** The pairing stored for this scooter, if any. */
  readonly credential?: Uint8Array | undefined;
  /** True only when the rider has asked to pair this phone. */
  readonly allowPairing: boolean;
}

export interface SessionOptions {
  readonly connection: BleConnection;
  readonly deviceName: string;
  readonly subtle: SubtleLike;
  readonly timers: Timers;
  readonly randomBytes: RandomBytes;
  /** How long to wait for one reply. Default 1000 ms. */
  readonly requestTimeoutMs?: number;
  /** Pause between pieces of one frame. Default 10 ms. */
  readonly pieceGapMs?: number;
  /** How long pairing may wait for the scooter, for example for a button press. Default 60 s. */
  readonly pairingTimeoutMs?: number;
  /** Wait between pairing retries. Default 2000 ms. */
  readonly pairingRetryMs?: number;
}

export class RequestTimeoutError extends Error {
  constructor() {
    super("The scooter did not answer in time");
    this.name = "RequestTimeoutError";
  }
}

export class SessionClosedError extends Error {
  constructor() {
    super("The link closed");
    this.name = "SessionClosedError";
  }
}

export class CounterExhaustedError extends Error {
  constructor() {
    super("The session counter is used up");
    this.name = "CounterExhaustedError";
  }
}

export class ProtocolError extends Error {
  constructor(detail: string) {
    super(`Unexpected reply (${detail})`);
    this.name = "ProtocolError";
  }
}

/** A session should be renewed before the 16 bit counter runs out. */
export const COUNTER_RENEW_AT = 0xf000;
const COUNTER_MAX = 0xffff;
const FIRST_CONTACT_PAYLOAD_MIN = 30;
const AUTH_PARAM_LENGTH = 16;
const SERIAL_LENGTH = 14;
const PASSWORD_LENGTH = 16;
const FIRST_CONTACT_TRIES = 3;

interface Pending {
  readonly resolve: (frame: Frame) => void;
  readonly reject: (error: Error) => void;
  readonly timer: unknown;
}

export class G3Session {
  private readonly reassembler = new FrameReassembler();
  private readonly pending = new Map<string, Pending>();
  private readonly cleanup: (() => void)[] = [];
  private readonly requestTimeoutMs: number;
  private readonly pieceGapMs: number;

  private key: AesKey | undefined;
  private authParam: Uint8Array | undefined;
  private serial: Uint8Array | undefined;
  private counterMode = false;
  private txCounter = 0;
  private writeChain: Promise<unknown> = Promise.resolve();
  private inboundChain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly options: SessionOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 1000;
    this.pieceGapMs = options.pieceGapMs ?? 10;
    this.cleanup.push(
      options.connection.onNotify((piece) => {
        for (const wire of this.reassembler.push(piece)) {
          this.inboundChain = this.inboundChain.then(() => this.handleWire(wire));
        }
      }),
      options.connection.onDisconnect(() => {
        this.close();
      }),
    );
  }

  /** True once the counter is close to running out. The adapter then starts a fresh session. */
  get needsRenewal(): boolean {
    return this.txCounter >= COUNTER_RENEW_AT;
  }

  async handshake(options: HandshakeOptions): Promise<HandshakeOutcome> {
    const name = asciiBytes(this.options.deviceName);

    // Step 1: first contact. Counter 0 mode, key from the name alone.
    this.key = await deriveKey(this.options.subtle, name);
    this.counterMode = false;
    let reply: Frame | undefined;
    for (let attempt = 0; attempt < FIRST_CONTACT_TRIES && reply === undefined; attempt++) {
      try {
        reply = await this.exchange(
          this.handshakeFrame(HANDSHAKE_FIRST_CONTACT, new Uint8Array(0)),
          handshakeKey(HANDSHAKE_FIRST_CONTACT),
        );
      } catch (error) {
        if (!(error instanceof RequestTimeoutError) || attempt === FIRST_CONTACT_TRIES - 1) {
          throw error;
        }
      }
    }
    if (reply === undefined || reply.payload.length < FIRST_CONTACT_PAYLOAD_MIN) {
      throw new ProtocolError("first contact");
    }
    this.authParam = reply.payload.slice(0, AUTH_PARAM_LENGTH);
    this.serial = reply.payload.slice(AUTH_PARAM_LENGTH, AUTH_PARAM_LENGTH + SERIAL_LENGTH);
    const scooterHasPairing = reply.index !== 0;
    this.counterMode = true;
    this.txCounter = 1;

    // Step 3 only, when this phone is already paired and the rider has not asked to pair again.
    if (scooterHasPairing && options.credential !== undefined && !options.allowPairing) {
      return this.authenticate(options.credential);
    }
    if (!options.allowPairing) {
      return { kind: "auth-needed", reason: "not-paired", explicit: false };
    }

    // Step 2: pairing, only on the rider's request.
    const password = this.options.randomBytes(PASSWORD_LENGTH);
    if (password.length !== PASSWORD_LENGTH) throw new ProtocolError("password length");
    this.key = await deriveKey(this.options.subtle, name, this.authParam);
    const deadline = Date.now() + (this.options.pairingTimeoutMs ?? 60_000);
    for (;;) {
      let answer: Frame | undefined;
      try {
        answer = await this.exchange(
          this.handshakeFrame(HANDSHAKE_PAIR, password),
          handshakeKey(HANDSHAKE_PAIR),
        );
      } catch (error) {
        if (!(error instanceof RequestTimeoutError)) throw error;
      }
      if (answer !== undefined && answer.index === 1) break;
      if (Date.now() >= deadline) {
        return { kind: "auth-needed", reason: "pairing-timeout", explicit: false };
      }
      await this.sleep(this.options.pairingRetryMs ?? 2000);
    }
    return this.authenticate(password);
  }

  /** Reads one allowlisted register from one board. Rejects with `RequestTimeoutError`. */
  async read(register: ReadRegister, target: number): Promise<Uint8Array> {
    const frame: Frame = {
      source: APP_ADDRESS,
      target,
      command: READ_COMMAND,
      index: register.index,
      payload: Uint8Array.of(register.size),
    };
    const reply = await this.exchange(frame, `r:${register.index}`);
    return reply.payload;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const stop of this.cleanup.splice(0)) stop();
    for (const [key, waiting] of this.pending) {
      this.options.timers.clearTimeout(waiting.timer);
      waiting.reject(new SessionClosedError());
      this.pending.delete(key);
    }
  }

  private async authenticate(password: Uint8Array): Promise<HandshakeOutcome> {
    const authParam = this.authParam;
    const serial = this.serial;
    if (authParam === undefined || serial === undefined)
      throw new ProtocolError("no first contact");
    this.key = await deriveKey(this.options.subtle, password, authParam);
    let answer: Frame | undefined;
    try {
      answer = await this.exchange(
        this.handshakeFrame(HANDSHAKE_AUTHENTICATE, serial),
        handshakeKey(HANDSHAKE_AUTHENTICATE),
      );
    } catch (error) {
      if (!(error instanceof RequestTimeoutError)) throw error;
      return { kind: "auth-needed", reason: "rejected", explicit: false };
    }
    if (answer.index === 1) return { kind: "authenticated", password };
    return { kind: "auth-needed", reason: "rejected", explicit: true };
  }

  private handshakeFrame(command: number, payload: Uint8Array): Frame {
    return { source: APP_ADDRESS, target: BLE_BOARD, command, index: 0, payload };
  }

  /** Sends one request and waits for its reply. Requests run strictly one after another. */
  private exchange(frame: Frame, matchKey: string): Promise<Frame> {
    const run = async (): Promise<Frame> => {
      if (this.closed) throw new SessionClosedError();
      const waiter = this.expect(matchKey);
      try {
        await this.transmit(frame);
      } catch (error) {
        this.drop(matchKey);
        throw error;
      }
      return waiter;
    };
    const result = this.writeChain.then(run, run);
    this.writeChain = result.catch(() => undefined);
    return result;
  }

  private expect(key: string): Promise<Frame> {
    return new Promise<Frame>((resolve, reject) => {
      const timer = this.options.timers.setTimeout(() => {
        this.pending.delete(key);
        reject(new RequestTimeoutError());
      }, this.requestTimeoutMs);
      this.pending.set(key, { resolve, reject, timer });
    });
  }

  private drop(key: string): void {
    const waiting = this.pending.get(key);
    if (waiting === undefined) return;
    this.options.timers.clearTimeout(waiting.timer);
    this.pending.delete(key);
  }

  private async transmit(frame: Frame): Promise<void> {
    // The guard runs here, on the way out, as well as inside `encodeRequest`.
    assertAllowedRequest(frame);
    const plain = encodeRequest(frame);
    const key = this.key;
    if (key === undefined) throw new ProtocolError("no key");
    let wire: Uint8Array;
    if (this.counterMode) {
      if (this.txCounter >= COUNTER_MAX) throw new CounterExhaustedError();
      this.txCounter += 1;
      const authParam = this.authParam;
      if (authParam === undefined) throw new ProtocolError("no authentication parameter");
      wire = await encryptCounterMode(key, authParam, this.txCounter, plain);
    } else {
      wire = await encryptCounterZero(key, plain);
    }
    const pieces = fragment(wire, this.options.connection.writePieceSize);
    for (let i = 0; i < pieces.length; i++) {
      if (this.closed) throw new SessionClosedError();
      if (i > 0) await this.sleep(this.pieceGapMs);
      const piece = pieces[i];
      if (piece !== undefined) await this.options.connection.write(piece);
    }
  }

  private async handleWire(wire: Uint8Array): Promise<void> {
    const key = this.key;
    if (this.closed || key === undefined) return;
    let plain: Uint8Array;
    try {
      const decrypted =
        this.counterMode && this.authParam !== undefined
          ? await decryptCounterMode(key, this.authParam, wire)
          : await decryptCounterZero(key, wire);
      plain = decrypted.plain;
    } catch (error) {
      // A frame that does not decrypt is dropped, like noise. The request then times out.
      if (error instanceof FrameCryptoError) return;
      throw error;
    }
    let frame: Frame;
    try {
      frame = parseFrame(plain);
    } catch {
      return;
    }
    if (frame.target !== APP_ADDRESS) return;
    const matchKey =
      frame.command === READ_REPLY_COMMAND
        ? `r:${frame.index}`
        : isHandshakeCommand(frame.command)
          ? handshakeKey(frame.command)
          : undefined;
    if (matchKey === undefined) return;
    const waiting = this.pending.get(matchKey);
    if (waiting === undefined) return;
    this.options.timers.clearTimeout(waiting.timer);
    this.pending.delete(matchKey);
    waiting.resolve(frame);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.options.timers.setTimeout(resolve, ms);
    });
  }
}

const handshakeKey = (command: number): string => `h:${command}`;

function isHandshakeCommand(command: number): boolean {
  return (
    command === HANDSHAKE_FIRST_CONTACT ||
    command === HANDSHAKE_PAIR ||
    command === HANDSHAKE_AUTHENTICATE
  );
}
