import { describe, expect, it } from "vitest";
import { bytesToHex, concatBytes } from "./bytes";
import {
  FrameFormatError,
  FrameReassembler,
  encodeRequest,
  fragment,
  layoutFrame,
  parseFrame,
} from "./frame";
import { APP_ADDRESS } from "./guard";

const readSpeed = () =>
  encodeRequest({
    source: APP_ADDRESS,
    target: 0x09,
    command: 0x01,
    index: 0x57,
    payload: Uint8Array.of(2),
  });

describe("plain frames", () => {
  it("lays out sync, length, source, target, command, register and payload", () => {
    expect(bytesToHex(readSpeed())).toBe("5aa5013e0901570" + "2");
  });

  it("counts payload bytes only in the length", () => {
    const frame = layoutFrame({
      source: 0x09,
      target: APP_ADDRESS,
      command: 0x04,
      index: 0x57,
      payload: Uint8Array.of(1, 2),
    });
    expect(frame[2]).toBe(2);
    expect(frame.length).toBe(9);
  });

  it("parses what it lays out", () => {
    const payload = Uint8Array.of(7, 8, 9);
    const frame = parseFrame(
      layoutFrame({ source: 9, target: APP_ADDRESS, command: 4, index: 0x55, payload }),
    );
    expect(frame).toMatchObject({ source: 9, target: APP_ADDRESS, command: 4, index: 0x55 });
    expect(Array.from(frame.payload)).toEqual([7, 8, 9]);
  });

  it("rejects bad sync bytes, short frames and a wrong length", () => {
    expect(() => parseFrame(Uint8Array.of(0x5a, 0xa4, 0, 0, 0, 0, 0))).toThrow(FrameFormatError);
    expect(() => parseFrame(Uint8Array.of(0x5a, 0xa5, 0))).toThrow(FrameFormatError);
    expect(() => parseFrame(Uint8Array.of(0x5a, 0xa5, 3, 0, 0, 0, 0, 1))).toThrow(FrameFormatError);
  });
});

describe("fragmentation", () => {
  it("cuts into pieces of at most the size and joins back exactly", () => {
    const bytes = Uint8Array.from({ length: 47 }, (_, i) => i);
    for (const size of [1, 7, 20, 46, 47, 200]) {
      const pieces = fragment(bytes, size);
      expect(pieces.every((p) => p.length <= size)).toBe(true);
      expect(bytesToHex(concatBytes(...pieces))).toBe(bytesToHex(bytes));
    }
  });

  it("rejects a piece size below 1", () => {
    expect(() => fragment(new Uint8Array(3), 0)).toThrow(RangeError);
  });
});

/** A wire frame of the right shape. The bytes after the length are arbitrary for reassembly. */
const wireFrame = (payloadLength: number, fill: number) =>
  Uint8Array.from([0x5a, 0xa5, payloadLength, ...Array(payloadLength + 10).fill(fill)]);

describe("reassembly", () => {
  it("rebuilds a frame split at every possible piece size", () => {
    const frame = wireFrame(30, 0x11);
    for (let size = 1; size <= frame.length; size++) {
      const reassembler = new FrameReassembler();
      const done = fragment(frame, size).flatMap((piece) => reassembler.push(piece));
      expect(done, `size ${size}`).toHaveLength(1);
      expect(bytesToHex(done[0] ?? new Uint8Array())).toBe(bytesToHex(frame));
    }
  });

  it("gives back two frames that arrive in one piece, and one split across pieces", () => {
    const a = wireFrame(2, 1);
    const b = wireFrame(5, 2);
    const reassembler = new FrameReassembler();
    const both = concatBytes(a, b);
    expect(reassembler.push(both)).toHaveLength(2);
    const split = concatBytes(a, b);
    const first = reassembler.push(split.slice(0, a.length + 3));
    const second = reassembler.push(split.slice(a.length + 3));
    expect([first.length, second.length]).toEqual([1, 1]);
  });

  it("skips noise before a frame and recovers from a broken sync", () => {
    const frame = wireFrame(4, 3);
    const reassembler = new FrameReassembler();
    const noisy = concatBytes(Uint8Array.of(0x00, 0x13, 0x5a, 0x5a, 0x00), frame);
    const done = reassembler.push(noisy);
    expect(done).toHaveLength(1);
    expect(bytesToHex(done[0] ?? new Uint8Array())).toBe(bytesToHex(frame));
  });

  it("starts again after reset", () => {
    const frame = wireFrame(1, 4);
    const reassembler = new FrameReassembler();
    reassembler.push(frame.slice(0, 6));
    reassembler.reset();
    expect(reassembler.push(frame)).toHaveLength(1);
  });
});
