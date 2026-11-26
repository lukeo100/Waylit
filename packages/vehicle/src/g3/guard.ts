import { READ_REGISTER_LIST, findReadRegister } from "./registers";

/**
 * The read only guard. Waylit never sends control commands to a vehicle, and this file is the
 * single place that says what it may send. Only two kinds of request exist:
 *
 * 1. Read requests for the registers in `registers.ts`, to the boards in `READ_TARGETS`.
 * 2. The three handshake requests that set up the encrypted session, to the Bluetooth board.
 *
 * Everything else, including every write, bit write and no reply write command, is refused by
 * `assertAllowedRequest`. The session checks every request here once more just before it is
 * encrypted and sent, so there is no path around the list. No write register, command byte or
 * helper for one exists anywhere in the package, and a test scans the source for that.
 */

/** Address the app uses as the source of its requests. */
export const APP_ADDRESS = 0x3e;
/** The Bluetooth board, the target of the handshake. */
export const BLE_BOARD = 0x04;
/** Boards that may answer telemetry reads, tried in this order. Unverified on a real G3. */
export const READ_TARGETS: readonly number[] = [0x09, 0x01];

/** Command byte of a read request, and of its reply. */
export const READ_COMMAND = 0x01;
export const READ_REPLY_COMMAND = 0x04;

/** Handshake command bytes, in order: first contact, pairing, authentication. */
export const HANDSHAKE_FIRST_CONTACT = 0x5b;
export const HANDSHAKE_PAIR = 0x5c;
export const HANDSHAKE_AUTHENTICATE = 0x5d;

/** Payload sizes of the handshake requests. */
export const HANDSHAKE_PAYLOAD_SIZE: Readonly<Record<number, number>> = {
  [HANDSHAKE_FIRST_CONTACT]: 0,
  [HANDSHAKE_PAIR]: 16,
  [HANDSHAKE_AUTHENTICATE]: 14,
};

/** The parts of a frame the guard looks at. */
export interface RequestShape {
  readonly source: number;
  readonly target: number;
  readonly command: number;
  readonly index: number;
  readonly payload: Uint8Array;
}

export class ForbiddenFrameError extends Error {
  constructor(detail: string) {
    super(`Refused: only handshake and read requests may be sent (${detail})`);
    this.name = "ForbiddenFrameError";
  }
}

/** True when a request is a handshake request or a read of an allowlisted register. */
export function isAllowedRequest(frame: RequestShape): boolean {
  if (frame.source !== APP_ADDRESS) return false;

  if (frame.command === READ_COMMAND) {
    const register = findReadRegister(frame.index);
    return (
      register !== undefined &&
      READ_TARGETS.includes(frame.target) &&
      frame.payload.length === 1 &&
      frame.payload[0] === register.size
    );
  }

  const handshakeSize = HANDSHAKE_PAYLOAD_SIZE[frame.command];
  if (handshakeSize !== undefined) {
    return (
      frame.target === BLE_BOARD && frame.index === 0 && frame.payload.length === handshakeSize
    );
  }
  return false;
}

export function assertAllowedRequest(frame: RequestShape): void {
  if (!isAllowedRequest(frame)) {
    throw new ForbiddenFrameError(
      `command 0x${frame.command.toString(16)}, register 0x${frame.index.toString(16)}`,
    );
  }
}

/** The register numbers that can be read, for tests and docs. */
export const ALLOWED_READ_INDEXES: readonly number[] = READ_REGISTER_LIST.map((r) => r.index);
