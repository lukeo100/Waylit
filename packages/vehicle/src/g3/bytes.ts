/** Small byte helpers for the G3 frame layer. No DOM and no Node types. */

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** Parses hex with optional spaces. Throws on odd length or a non hex character. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error("Not a hex string");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const length = Math.min(a.length, b.length);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  return out;
}

/** Compares in time that does not depend on where the bytes differ. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Reads an unsigned little endian integer of 1 to 4 bytes. */
export function readUintLE(bytes: Uint8Array, offset: number, size: number): number {
  let value = 0;
  for (let i = size - 1; i >= 0; i--) value = value * 256 + (bytes[offset + i] ?? 0);
  return value;
}

/** Reads a signed little endian integer of 1 to 4 bytes. */
export function readIntLE(bytes: Uint8Array, offset: number, size: number): number {
  const unsigned = readUintLE(bytes, offset, size);
  const limit = 2 ** (size * 8 - 1);
  return unsigned >= limit ? unsigned - limit * 2 : unsigned;
}

export function writeUintLE(value: number, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let rest = Math.max(0, Math.round(value));
  for (let i = 0; i < size; i++) {
    out[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  return out;
}

export function writeUint32BE(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

/** Zero pads or truncates to exactly `length` bytes. */
export function fit(bytes: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  out.set(bytes.subarray(0, length));
  return out;
}

export function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0x7f;
  return out;
}
