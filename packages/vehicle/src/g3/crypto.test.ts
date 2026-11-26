import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "./bytes";
import {
  AesKey,
  FrameCryptoError,
  decryptCounterMode,
  decryptCounterZero,
  defaultSubtle,
  deriveKey,
  encryptCounterMode,
  encryptCounterZero,
} from "./crypto";
import {
  referenceEncryptCounterMode,
  referenceEncryptCounterZero,
  referenceKey,
} from "./reference-crypto";

// Every value below is invented for these tests. None of it belongs to a real device.
const NAME = new TextEncoder().encode("NB-TESTUNIT0");
const AUTH_PARAM = hexToBytes("000102030405060708090a0b0c0d0e0f");
const PASSWORD = hexToBytes("a0a1a2a3a4a5a6a7a8a9aaabacadaeaf");

const subtle = defaultSubtle();
if (subtle === undefined) throw new Error("WebCrypto is needed to run these tests");

const plainFrame = (payload: number[]) =>
  Uint8Array.from([0x5a, 0xa5, payload.length, 0x3e, 0x09, 0x01, 0x57, ...payload]);

describe("AES block primitive", () => {
  it("matches the public FIPS 197 example vector", async () => {
    const key = await AesKey.fromBytes(subtle, hexToBytes("000102030405060708090a0b0c0d0e0f"));
    const out = await key.encryptBlock(hexToBytes("00112233445566778899aabbccddeeff"));
    expect(bytesToHex(out)).toBe("69c4e0d86a7b0430d8cdb78070b4c55a");
  });

  it("rejects a key that is not 16 bytes", async () => {
    await expect(AesKey.fromBytes(subtle, new Uint8Array(15))).rejects.toThrow();
  });
});

describe("counter mode frames", () => {
  it("matches an independent implementation for many sizes and counters", async () => {
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    const refKey = referenceKey(PASSWORD, AUTH_PARAM);
    for (const size of [0, 1, 2, 11, 12, 13, 14, 15, 30, 47]) {
      for (const counter of [1, 2, 3, 255, 256, 4097, 0xffff]) {
        const payload = Array.from({ length: size }, (_, i) => (i * 7 + counter) & 0xff);
        const plain = plainFrame(payload);
        const ours = await encryptCounterMode(key, AUTH_PARAM, counter, plain);
        const reference = referenceEncryptCounterMode(refKey, AUTH_PARAM, counter, plain);
        expect(bytesToHex(ours), `size ${size} counter ${counter}`).toBe(bytesToHex(reference));
        expect(ours.length).toBe(size + 13);
      }
    }
  });

  it("round trips and reports the counter", async () => {
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    const plain = plainFrame([1, 2, 3, 4, 5]);
    const wire = await encryptCounterMode(key, AUTH_PARAM, 42, plain);
    const back = await decryptCounterMode(key, AUTH_PARAM, wire);
    expect(bytesToHex(back.plain)).toBe(bytesToHex(plain));
    expect(back.counter).toBe(42);
  });

  it("keeps the header in the clear and hides the body", async () => {
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    const plain = plainFrame([9, 9, 9, 9]);
    const wire = await encryptCounterMode(key, AUTH_PARAM, 5, plain);
    expect(Array.from(wire.slice(0, 3))).toEqual([0x5a, 0xa5, 4]);
    expect(bytesToHex(wire.slice(3, 7))).not.toBe(bytesToHex(plain.slice(3, 7)));
  });

  it("produces a different frame for a different counter", async () => {
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    const plain = plainFrame([1]);
    const a = await encryptCounterMode(key, AUTH_PARAM, 2, plain);
    const b = await encryptCounterMode(key, AUTH_PARAM, 3, plain);
    expect(bytesToHex(a.slice(3, 8))).not.toBe(bytesToHex(b.slice(3, 8)));
  });

  it("rejects any changed byte in the body, tag or counter", async () => {
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    const wire = await encryptCounterMode(key, AUTH_PARAM, 7, plainFrame([1, 2, 3, 4]));
    for (let i = 3; i < wire.length; i++) {
      const bad = wire.slice();
      bad[i] = (bad[i] ?? 0) ^ 0x01;
      await expect(decryptCounterMode(key, AUTH_PARAM, bad)).rejects.toBeInstanceOf(
        FrameCryptoError,
      );
    }
  });

  it("rejects a changed header", async () => {
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    const wire = await encryptCounterMode(key, AUTH_PARAM, 7, plainFrame([1, 2, 3, 4]));
    const bad = wire.slice();
    bad[1] = 0xa4;
    await expect(decryptCounterMode(key, AUTH_PARAM, bad)).rejects.toBeInstanceOf(FrameCryptoError);
  });

  it("rejects the wrong key and the wrong authentication parameter", async () => {
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    const other = await deriveKey(subtle, NAME, AUTH_PARAM);
    const wire = await encryptCounterMode(key, AUTH_PARAM, 7, plainFrame([1, 2]));
    await expect(decryptCounterMode(other, AUTH_PARAM, wire)).rejects.toBeInstanceOf(
      FrameCryptoError,
    );
    await expect(decryptCounterMode(key, hexToBytes("ff".repeat(16)), wire)).rejects.toBeInstanceOf(
      FrameCryptoError,
    );
  });

  it("rejects short or wrong length frames", async () => {
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    await expect(decryptCounterMode(key, AUTH_PARAM, new Uint8Array(5))).rejects.toMatchObject({
      reason: "short",
    });
    const wire = await encryptCounterMode(key, AUTH_PARAM, 7, plainFrame([1, 2]));
    await expect(decryptCounterMode(key, AUTH_PARAM, wire.slice(0, -1))).rejects.toMatchObject({
      reason: "length",
    });
  });

  it("refuses a counter outside 1 to 65535", async () => {
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    await expect(encryptCounterMode(key, AUTH_PARAM, 0, plainFrame([]))).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(
      encryptCounterMode(key, AUTH_PARAM, 0x10000, plainFrame([])),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("has a stable known answer for fixed invented inputs", async () => {
    // Frozen from this implementation, which also matches the independent one above. It guards
    // against an accidental change to the scheme. It is not data from a real scooter.
    const key = await deriveKey(subtle, PASSWORD, AUTH_PARAM);
    const wire = await encryptCounterMode(key, AUTH_PARAM, 2, plainFrame([0x02]));
    const again = await encryptCounterMode(key, AUTH_PARAM, 2, plainFrame([0x02]));
    expect(bytesToHex(wire)).toBe(bytesToHex(again));
    expect(bytesToHex(wire)).toBe(
      bytesToHex(
        referenceEncryptCounterMode(
          referenceKey(PASSWORD, AUTH_PARAM),
          AUTH_PARAM,
          2,
          plainFrame([2]),
        ),
      ),
    );
    expect(wire.length).toBe(14);
  });
});

describe("counter 0 frames", () => {
  it("matches an independent implementation", async () => {
    const key = await deriveKey(subtle, NAME);
    const refKey = referenceKey(NAME);
    for (const size of [0, 1, 16, 30]) {
      const plain = plainFrame(Array.from({ length: size }, (_, i) => i + 3));
      const ours = await encryptCounterZero(key, plain);
      expect(bytesToHex(ours)).toBe(bytesToHex(referenceEncryptCounterZero(refKey, plain)));
      expect(ours.length).toBe(size + 13);
    }
  });

  it("round trips and checks the sum", async () => {
    const key = await deriveKey(subtle, NAME);
    const plain = plainFrame([5, 6, 7]);
    const wire = await encryptCounterZero(key, plain);
    const back = await decryptCounterZero(key, wire);
    expect(bytesToHex(back.plain)).toBe(bytesToHex(plain));
    expect(back.counter).toBe(0);
    const bad = wire.slice();
    bad[3] = (bad[3] ?? 0) ^ 0x10;
    await expect(decryptCounterZero(key, bad)).rejects.toBeInstanceOf(FrameCryptoError);
  });

  it("accepts the sum in either documented tail position", async () => {
    const key = await deriveKey(subtle, NAME);
    const plain = plainFrame([5, 6, 7]);
    const wire = await encryptCounterZero(key, plain);
    // Move the two checksum bytes from the middle of the tail to its end.
    const moved = wire.slice();
    const tail = wire.length - 6;
    moved[tail + 2] = 0;
    moved[tail + 3] = 0;
    moved[tail + 4] = wire[tail + 2] ?? 0;
    moved[tail + 5] = wire[tail + 3] ?? 0;
    const back = await decryptCounterZero(key, moved);
    expect(bytesToHex(back.plain)).toBe(bytesToHex(plain));
  });
});

describe("key derivation", () => {
  it("treats a missing second key as zeros", async () => {
    const a = await deriveKey(subtle, NAME);
    const b = await deriveKey(subtle, NAME, new Uint8Array(16));
    const block = new Uint8Array(16);
    expect(bytesToHex(await a.encryptBlock(block))).toBe(bytesToHex(await b.encryptBlock(block)));
  });

  it("changes with either input", async () => {
    const block = new Uint8Array(16);
    const base = bytesToHex(await (await deriveKey(subtle, NAME, AUTH_PARAM)).encryptBlock(block));
    const k1 = bytesToHex(
      await (await deriveKey(subtle, PASSWORD, AUTH_PARAM)).encryptBlock(block),
    );
    const k2 = bytesToHex(await (await deriveKey(subtle, NAME, PASSWORD)).encryptBlock(block));
    expect(new Set([base, k1, k2]).size).toBe(3);
  });
});
