import { concatBytes, equalBytes, fit, writeUint32BE, xorBytes } from "./bytes";

/**
 * The encrypted frame layer, written from the protocol description in the reverse engineering
 * documentation credited in docs/THIRD_PARTY.md. It uses only WebCrypto (SubtleCrypto): AES-128
 * as a block primitive (through AES-CBC with a zero IV for a single block, which equals AES-ECB
 * for one block) and AES-CTR for the payload keystream, plus SHA-1 for the key.
 *
 * The scheme, as documented:
 *
 * - Key: first 16 bytes of SHA-1 over key1 and key2, each zero padded to 16 bytes. Which values
 *   are key1 and key2 changes per handshake phase (see `session.ts`).
 * - Wire frame: three plain header bytes (sync 5A A5 and the length), then the encrypted body,
 *   then a six byte tail. Total size is the length byte plus 13.
 * - Counter mode (SN mode): the tail is the 4 byte tag, encrypted, then the 2 byte counter,
 *   big endian. The nonce is the 4 byte big endian counter, the first 8 bytes of the device's
 *   authentication parameter and a zero byte (13 bytes). Keystream block i is AES of
 *   [01, nonce, 00, i]. Block 0 hides the tag and blocks 1 and up hide the body. The tag is the
 *   first 4 bytes of a CBC-MAC over the plain body, starting from AES of
 *   [59, nonce, 00, body length], then the header as one zero padded block, then the body in
 *   zero padded blocks.
 * - Counter 0 mode (before the handshake has an authentication parameter): the body is XORed
 *   with AES of a zero block, and the tail is a 16 bit inverted sum of the plain body.
 *
 * Everything here is unverified against a real vehicle. Frames built here are only ever
 * handshake and read requests (see `registers.ts`).
 */

/** The parts of SubtleCrypto used here, so tests and other runtimes can supply their own. */
export interface SubtleLike {
  importKey(
    format: "raw",
    keyData: Uint8Array,
    algorithm: { name: string },
    extractable: boolean,
    usages: string[],
  ): Promise<unknown>;
  encrypt(
    algorithm: { name: string; [option: string]: unknown },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
}

/** Finds SubtleCrypto in the current runtime, or undefined. */
export function defaultSubtle(): SubtleLike | undefined {
  const scope = globalThis as { crypto?: { subtle?: SubtleLike } };
  return scope.crypto?.subtle;
}

const BLOCK = 16;
const ZERO_BLOCK = new Uint8Array(BLOCK);
export const HEADER_LENGTH = 3;
export const SN_TAIL_LENGTH = 6;
/** The wire frame is the length byte plus this many bytes. */
export const WIRE_OVERHEAD = 13;
const MAC_LENGTH = 4;
const NONCE_AUTH_BYTES = 8;

export class AesKey {
  private constructor(
    private readonly subtle: SubtleLike,
    private readonly cbcKey: unknown,
    private readonly ctrKey: unknown,
  ) {}

  static async fromBytes(subtle: SubtleLike, raw: Uint8Array): Promise<AesKey> {
    if (raw.length !== BLOCK) throw new Error("AES key must be 16 bytes");
    const cbc = await subtle.importKey("raw", raw, { name: "AES-CBC" }, false, ["encrypt"]);
    const ctr = await subtle.importKey("raw", raw, { name: "AES-CTR" }, false, ["encrypt"]);
    return new AesKey(subtle, cbc, ctr);
  }

  /** AES of one 16 byte block. */
  async encryptBlock(block: Uint8Array): Promise<Uint8Array> {
    const out = await this.subtle.encrypt({ name: "AES-CBC", iv: ZERO_BLOCK }, this.cbcKey, block);
    return new Uint8Array(out).slice(0, BLOCK);
  }

  /** AES-CTR keystream XOR, counting the last byte of the counter block. Up to 255 blocks. */
  async ctr(counterBlock: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    if (data.length === 0) return new Uint8Array(0);
    const out = await this.subtle.encrypt(
      { name: "AES-CTR", counter: counterBlock, length: 8 },
      this.ctrKey,
      data,
    );
    return new Uint8Array(out);
  }
}

/** Key = first 16 bytes of SHA-1(key1 padded to 16 || key2 padded to 16). A missing key2 is zeros. */
export async function deriveKey(
  subtle: SubtleLike,
  key1: Uint8Array,
  key2?: Uint8Array,
): Promise<AesKey> {
  const material = concatBytes(fit(key1, BLOCK), fit(key2 ?? ZERO_BLOCK, BLOCK));
  const digest = new Uint8Array(await subtle.digest("SHA-1", material));
  return AesKey.fromBytes(subtle, digest.slice(0, BLOCK));
}

/** 13 byte nonce: 4 byte big endian counter, 8 bytes of the authentication parameter, zero. */
export function buildNonce(counter: number, authParam: Uint8Array): Uint8Array {
  return concatBytes(writeUint32BE(counter), fit(authParam, NONCE_AUTH_BYTES), new Uint8Array(1));
}

function ctrBlock(nonce: Uint8Array, index: number): Uint8Array {
  return concatBytes(Uint8Array.of(0x01), nonce, Uint8Array.of(0x00, index));
}

async function computeTag(key: AesKey, nonce: Uint8Array, header: Uint8Array, body: Uint8Array) {
  const b0 = concatBytes(Uint8Array.of(0x59), nonce, Uint8Array.of(0x00, body.length & 0xff));
  let state = await key.encryptBlock(b0);
  state = await key.encryptBlock(xorBytes(state, fit(header, BLOCK)));
  for (let offset = 0; offset < body.length; offset += BLOCK) {
    state = await key.encryptBlock(
      xorBytes(state, fit(body.subarray(offset, offset + BLOCK), BLOCK)),
    );
  }
  return state.slice(0, MAC_LENGTH);
}

export interface Decrypted {
  /** Plain frame: the three header bytes followed by the body. */
  readonly plain: Uint8Array;
  /** The counter read from the tail. Always 0 for counter 0 mode. */
  readonly counter: number;
}

export class FrameCryptoError extends Error {
  constructor(readonly reason: "short" | "length" | "mac" | "checksum") {
    super(`Frame could not be decrypted (${reason})`);
    this.name = "FrameCryptoError";
  }
}

/**
 * Encrypts a plain frame (5A A5 length, then the body) in counter mode. The caller supplies the
 * counter value to use, which must be larger than every earlier one in the session.
 */
export async function encryptCounterMode(
  key: AesKey,
  authParam: Uint8Array,
  counter: number,
  plain: Uint8Array,
): Promise<Uint8Array> {
  if (!Number.isInteger(counter) || counter < 1 || counter > 0xffff) {
    throw new RangeError("Counter must be 1 to 65535");
  }
  const header = plain.slice(0, HEADER_LENGTH);
  const body = plain.slice(HEADER_LENGTH);
  const nonce = buildNonce(counter, authParam);
  const tag = await computeTag(key, nonce, header, body);
  const encryptedBody = await key.ctr(ctrBlock(nonce, 1), body);
  const keystream0 = await key.encryptBlock(ctrBlock(nonce, 0));
  const encryptedTag = xorBytes(tag, keystream0.subarray(0, MAC_LENGTH));
  return concatBytes(
    header,
    encryptedBody,
    encryptedTag,
    Uint8Array.of(counter >> 8, counter & 0xff),
  );
}

export async function decryptCounterMode(
  key: AesKey,
  authParam: Uint8Array,
  wire: Uint8Array,
): Promise<Decrypted> {
  if (wire.length < HEADER_LENGTH + SN_TAIL_LENGTH) throw new FrameCryptoError("short");
  if (wire.length !== (wire[2] ?? 0) + WIRE_OVERHEAD) throw new FrameCryptoError("length");
  const header = wire.slice(0, HEADER_LENGTH);
  const bodyEnd = wire.length - SN_TAIL_LENGTH;
  const encryptedBody = wire.slice(HEADER_LENGTH, bodyEnd);
  const encryptedTag = wire.slice(bodyEnd, bodyEnd + MAC_LENGTH);
  const counter = ((wire[wire.length - 2] ?? 0) << 8) | (wire[wire.length - 1] ?? 0);
  const nonce = buildNonce(counter, authParam);
  const body = await key.ctr(ctrBlock(nonce, 1), encryptedBody);
  const keystream0 = await key.encryptBlock(ctrBlock(nonce, 0));
  const tag = xorBytes(encryptedTag, keystream0.subarray(0, MAC_LENGTH));
  const expected = await computeTag(key, nonce, header, body);
  if (!equalBytes(tag, expected)) throw new FrameCryptoError("mac");
  return { plain: concatBytes(header, body), counter };
}

/** 16 bit inverted sum of the bytes. */
export function invertedSum16(bytes: Uint8Array): number {
  let sum = 0;
  for (const byte of bytes) sum += byte;
  return ~sum & 0xffff;
}

/**
 * Counter 0 mode, used for the first handshake request and its answer. The documentation
 * describes the six byte tail as two zero bytes, the checksum (low byte, then high byte) and two
 * more zero bytes, while its transport page only says four padding bytes and then the checksum.
 * Both are six bytes. This encoder writes the first layout and the decoder accepts either.
 */
export async function encryptCounterZero(key: AesKey, plain: Uint8Array): Promise<Uint8Array> {
  const header = plain.slice(0, HEADER_LENGTH);
  const body = plain.slice(HEADER_LENGTH);
  const keystream = await key.encryptBlock(ZERO_BLOCK);
  const encrypted = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) encrypted[i] = (body[i] ?? 0) ^ (keystream[i % BLOCK] ?? 0);
  const checksum = invertedSum16(body);
  return concatBytes(header, encrypted, Uint8Array.of(0, 0, checksum & 0xff, checksum >> 8, 0, 0));
}

export async function decryptCounterZero(key: AesKey, wire: Uint8Array): Promise<Decrypted> {
  if (wire.length < HEADER_LENGTH + SN_TAIL_LENGTH) throw new FrameCryptoError("short");
  if (wire.length !== (wire[2] ?? 0) + WIRE_OVERHEAD) throw new FrameCryptoError("length");
  const header = wire.slice(0, HEADER_LENGTH);
  const bodyEnd = wire.length - SN_TAIL_LENGTH;
  const tail = wire.slice(bodyEnd);
  const keystream = await key.encryptBlock(ZERO_BLOCK);
  const body = new Uint8Array(bodyEnd - HEADER_LENGTH);
  for (let i = 0; i < body.length; i++) {
    body[i] = (wire[HEADER_LENGTH + i] ?? 0) ^ (keystream[i % BLOCK] ?? 0);
  }
  const checksum = invertedSum16(body);
  const at = (offset: number): number => (tail[offset] ?? 0) | ((tail[offset + 1] ?? 0) << 8);
  if (at(2) !== checksum && at(4) !== checksum) throw new FrameCryptoError("checksum");
  return { plain: concatBytes(header, body), counter: 0 };
}
