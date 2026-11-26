/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { encodeRequest } from "./frame";
import {
  ALLOWED_READ_INDEXES,
  APP_ADDRESS,
  BLE_BOARD,
  ForbiddenFrameError,
  HANDSHAKE_AUTHENTICATE,
  HANDSHAKE_FIRST_CONTACT,
  HANDSHAKE_PAIR,
  READ_TARGETS,
  isAllowedRequest,
  type RequestShape,
} from "./guard";
import { READ_REGISTER_LIST } from "./registers";

/**
 * The read only guard. These tests walk every command byte and every register number, so a new
 * write path of any kind (a new command, a new register, a new payload shape) fails here.
 */

const TARGETS = [0x00, 0x01, 0x02, 0x04, 0x05, 0x09, 0x11, 0x3e, 0xff];
const PAYLOADS: Uint8Array[] = [
  new Uint8Array(0),
  Uint8Array.of(1),
  Uint8Array.of(2),
  Uint8Array.of(4),
  Uint8Array.of(0, 0),
  new Uint8Array(14),
  new Uint8Array(16),
  Uint8Array.of(2, 2),
];

function expectedAllowed(frame: RequestShape): boolean {
  if (frame.source !== APP_ADDRESS) return false;
  const register = READ_REGISTER_LIST.find((r) => r.index === frame.index);
  if (frame.command === 0x01) {
    return (
      register !== undefined &&
      [0x09, 0x01].includes(frame.target) &&
      frame.payload.length === 1 &&
      frame.payload[0] === register.size
    );
  }
  const sizes: Record<number, number> = { 0x5b: 0, 0x5c: 16, 0x5d: 14 };
  const size = sizes[frame.command];
  return (
    size !== undefined &&
    frame.target === 0x04 &&
    frame.index === 0 &&
    frame.payload.length === size
  );
}

describe("allowlist", () => {
  it("allows exactly the read and handshake requests and nothing else", () => {
    let allowed = 0;
    for (const target of TARGETS) {
      for (let command = 0; command < 256; command++) {
        for (let index = 0; index < 256; index++) {
          for (const payload of PAYLOADS) {
            const frame = { source: APP_ADDRESS, target, command, index, payload };
            const ok = isAllowedRequest(frame);
            if (ok !== expectedAllowed(frame)) {
              throw new Error(`Guard disagrees for command ${command} register ${index}`);
            }
            if (ok) allowed++;
          }
        }
      }
    }
    // 9 registers x 2 read boards, plus the 3 handshake requests.
    expect(allowed).toBe(READ_REGISTER_LIST.length * READ_TARGETS.length + 3);
  });

  it("cannot encode any command byte other than a read or a handshake step", () => {
    const commands = new Set<number>();
    const someTargets = [0x09, BLE_BOARD];
    const somePayloads = [
      new Uint8Array(0),
      Uint8Array.of(2),
      new Uint8Array(14),
      new Uint8Array(16),
    ];
    for (let command = 0; command < 256; command++) {
      for (let index = 0; index < 256; index++) {
        for (const target of someTargets) {
          for (const payload of somePayloads) {
            try {
              encodeRequest({ source: APP_ADDRESS, target, command, index, payload });
              commands.add(command);
            } catch (error) {
              expect(error).toBeInstanceOf(ForbiddenFrameError);
            }
          }
        }
      }
    }
    expect([...commands].sort((a, b) => a - b)).toEqual([0x01, 0x5b, 0x5c, 0x5d]);
  }, 60_000);

  it("refuses every write style command for every allowlisted register", () => {
    // 0x02 write, 0x03 write with no reply, 0x06 bit write, and the reply codes.
    for (const command of [0x02, 0x03, 0x04, 0x05, 0x06]) {
      for (const index of ALLOWED_READ_INDEXES) {
        for (const target of [...READ_TARGETS, BLE_BOARD]) {
          for (const payload of PAYLOADS) {
            expect(() => {
              encodeRequest({ source: APP_ADDRESS, target, command, index, payload });
            }).toThrow(ForbiddenFrameError);
          }
        }
      }
    }
  });

  it("refuses frames that do not come from the app", () => {
    const frame = {
      source: 0x20,
      target: 0x09,
      command: 0x01,
      index: 0x57,
      payload: Uint8Array.of(2),
    };
    expect(isAllowedRequest(frame)).toBe(false);
    expect(() => encodeRequest(frame)).toThrow(ForbiddenFrameError);
  });

  it("only reads the registers named in the plan", () => {
    expect([...ALLOWED_READ_INDEXES].sort((a, b) => a - b)).toEqual([
      0x55, 0x57, 0x58, 0x59, 0x5a, 0x5f, 0x62, 0x68, 0x6b,
    ]);
  });

  it("sends the handshake only to the Bluetooth board, with register 0", () => {
    for (const command of [HANDSHAKE_FIRST_CONTACT, HANDSHAKE_PAIR, HANDSHAKE_AUTHENTICATE]) {
      const size = command === HANDSHAKE_PAIR ? 16 : command === HANDSHAKE_AUTHENTICATE ? 14 : 0;
      const base = {
        source: APP_ADDRESS,
        target: BLE_BOARD,
        command,
        index: 0,
        payload: new Uint8Array(size),
      };
      expect(isAllowedRequest(base)).toBe(true);
      expect(isAllowedRequest({ ...base, target: 0x09 })).toBe(false);
      expect(isAllowedRequest({ ...base, index: 1 })).toBe(false);
      expect(isAllowedRequest({ ...base, payload: new Uint8Array(size + 1) })).toBe(false);
    }
  });
});

/** Source files of the vehicle package and the app's vehicle code, tests excluded. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const here = fileURLToPath(new URL(".", import.meta.url));
const vehicleSrc = join(here, "..");
const appVehicleDirs = [
  join(here, "../../../../apps/web/src/vehicle"),
  join(here, "../../../../apps/web/src/hud"),
];
const scanned = [
  ...sourceFiles(vehicleSrc),
  ...appVehicleDirs.flatMap((dir) => {
    try {
      return sourceFiles(dir);
    } catch {
      return [];
    }
  }),
];

/**
 * Names of vehicle control commands, from the documentation's list of write registers and
 * common control words. None of them may appear in shipped source.
 */
const FORBIDDEN = [
  "setMaxSpeed",
  "setLimitSpeed",
  "setSpeedLimit",
  "setMaxPower",
  "setBrownOut",
  "setGearMode",
  "setGearED",
  "setGearSR",
  "setSGear",
  "setDGear",
  "setEGear",
  "setLedMode",
  "setProjectionLightMode",
  "setTailLightMode",
  "setDecMode",
  "setCruise",
  "setAutoOffTime",
  "setCustomKey",
  "setFoldShutdown",
  "setFunBool",
  "setAlarmLevel",
  "setBumpyRoad",
  "setVoiceVolume",
  "setInstumentKey",
  "setMaintainCode",
  "setUUID",
  "setConnectMode",
  "setKeyPwd",
  "setPwd",
  "wStartSpeed",
  "wMileage",
  "wSN",
  "wSysTime",
  "playSound",
  "unbondFindMy",
  "openFindMyPairBroadcast",
  "setNavi",
  "unlockVehicle",
  "lockVehicle",
  "openAcc",
  "closeAcc",
  "openTrunk",
  "writeRegister",
  "writeNoReply",
  "writeBit",
  "CMD_WRITE",
  "COMMAND_WRITE",
  "WRITE_NR",
  "WR_BIT",
  "sendControl",
  "sendCommand",
];

describe("static scan of shipped source", () => {
  it("finds the files it is meant to scan", () => {
    const names = scanned.map((file) => file.slice(file.lastIndexOf("/") + 1));
    expect(names).toContain("guard.ts");
    expect(names).toContain("adapter.ts");
    expect(names).toContain("mock-adapter.ts");
  });

  it("contains no write or control command name", () => {
    for (const file of scanned) {
      const text = readFileSync(file, "utf8");
      for (const name of FORBIDDEN) {
        expect(text.includes(name), `${name} appears in ${file}`).toBe(false);
      }
    }
  });

  it("defines no write command byte (0x02, 0x03, 0x05 or 0x06 as a command constant)", () => {
    const pattern = /\b(?:COMMAND|CMD|command)\w*\s*[:=]\s*0x0[2356]\b/;
    for (const file of scanned) {
      expect(pattern.test(readFileSync(file, "utf8")), file).toBe(false);
    }
  });

  it("names no characteristic other than the write and notify ones", () => {
    const uuid = /6e40000[0-9a-f]-[0-9a-f-]+/gi;
    const allowed = new Set([
      "6e400001-0000-0000-006e-696e65626f74",
      "6e400002-0000-0000-006e-696e65626f74",
      "6e400004-0000-0000-006e-696e65626f74",
    ]);
    for (const file of scanned) {
      for (const found of readFileSync(file, "utf8").match(uuid) ?? []) {
        expect(allowed.has(found.toLowerCase()), `${found} in ${file}`).toBe(true);
      }
    }
  });

  it("has no hard coded secret, serial number or address in shipped source", () => {
    // A MAC address, or a long run of hex that could be a key.
    const mac = /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/i;
    const longHex = /["'`][0-9a-f]{32,}["'`]/i;
    for (const file of scanned) {
      const text = readFileSync(file, "utf8");
      expect(mac.test(text), `MAC like text in ${file}`).toBe(false);
      expect(longHex.test(text), `long hex in ${file}`).toBe(false);
    }
  });
});
