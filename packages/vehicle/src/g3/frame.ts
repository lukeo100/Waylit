import { concatBytes } from "./bytes";
import { assertAllowedRequest } from "./guard";
import { WIRE_OVERHEAD } from "./crypto";

/**
 * Plain frames, fragmentation and reassembly.
 *
 * A plain frame is: 5A A5, the length (payload bytes only), the source address, the target
 * address, the command, the register number, then the payload. Encrypted on the wire it becomes
 * length plus 13 bytes (see `crypto.ts`). Frames are cut into pieces of at most MTU minus 3
 * bytes to write, and the vehicle cuts its notifications the same way.
 */

export const SYNC_1 = 0x5a;
export const SYNC_2 = 0xa5;
/** Source, target, command and register number. */
export const BODY_FIXED = 4;

export interface Frame {
  readonly source: number;
  readonly target: number;
  readonly command: number;
  readonly index: number;
  readonly payload: Uint8Array;
}

/**
 * Lays out a frame with no checks. Not exported from the package: requests go through
 * `encodeRequest`, and only the desk simulator builds replies with this.
 */
export function layoutFrame(frame: Frame): Uint8Array {
  if (frame.payload.length > 0xff) throw new RangeError("Payload too long");
  return concatBytes(
    Uint8Array.of(
      SYNC_1,
      SYNC_2,
      frame.payload.length,
      frame.source,
      frame.target,
      frame.command,
      frame.index,
    ),
    frame.payload,
  );
}

/** Lays out a request, after the guard has accepted it. This is the only way to build one. */
export function encodeRequest(frame: Frame): Uint8Array {
  assertAllowedRequest(frame);
  return layoutFrame(frame);
}

export class FrameFormatError extends Error {
  constructor(detail: string) {
    super(`Bad frame (${detail})`);
    this.name = "FrameFormatError";
  }
}

/** Reads a plain frame back into its fields. */
export function parseFrame(plain: Uint8Array): Frame {
  if (plain.length < 3 + BODY_FIXED) throw new FrameFormatError("too short");
  if (plain[0] !== SYNC_1 || plain[1] !== SYNC_2) throw new FrameFormatError("no sync bytes");
  const length = plain[2] ?? 0;
  if (plain.length !== 3 + BODY_FIXED + length) throw new FrameFormatError("length mismatch");
  return {
    source: plain[3] ?? 0,
    target: plain[4] ?? 0,
    command: plain[5] ?? 0,
    index: plain[6] ?? 0,
    payload: plain.slice(7),
  };
}

/** Cuts bytes into pieces of at most `maxPiece` bytes. */
export function fragment(bytes: Uint8Array, maxPiece: number): Uint8Array[] {
  if (!Number.isInteger(maxPiece) || maxPiece < 1)
    throw new RangeError("Piece size must be 1 or more");
  const pieces: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += maxPiece) {
    pieces.push(bytes.slice(offset, offset + maxPiece));
  }
  return pieces;
}

type ReassemblyState = "idle" | "have-first-sync" | "collecting";

/**
 * Puts notification pieces back together. It looks for the two sync bytes, reads the length and
 * collects length plus 13 bytes, and drops anything that does not start properly. Pieces may
 * split a frame anywhere, and one piece may hold the end of a frame and the start of the next.
 */
export class FrameReassembler {
  private state: ReassemblyState = "idle";
  private buffer: number[] = [];
  private expected = 0;

  /** Feeds one piece and returns every frame it completed, in order. */
  push(piece: Uint8Array): Uint8Array[] {
    const done: Uint8Array[] = [];
    for (const byte of piece) {
      switch (this.state) {
        case "idle":
          if (byte === SYNC_1) {
            this.buffer = [byte];
            this.state = "have-first-sync";
          }
          break;
        case "have-first-sync":
          if (byte === SYNC_2) {
            this.buffer.push(byte);
            this.state = "collecting";
            this.expected = 0;
          } else {
            this.reset();
            // The byte may itself start a frame.
            if (byte === SYNC_1) {
              this.buffer = [byte];
              this.state = "have-first-sync";
            }
          }
          break;
        case "collecting":
          this.buffer.push(byte);
          if (this.buffer.length === 3) this.expected = byte + WIRE_OVERHEAD;
          if (this.buffer.length >= 3 && this.buffer.length === this.expected) {
            done.push(Uint8Array.from(this.buffer));
            this.reset();
          }
          break;
      }
    }
    return done;
  }

  reset(): void {
    this.state = "idle";
    this.buffer = [];
    this.expected = 0;
  }
}
