import { describe, expect, it } from "vitest";
import type { AdapterStatus } from "@waylit/vehicle";
import {
  VEHICLE_STORAGE_KEY,
  VEHICLE_TEXT,
  describeVehicleStatus,
  parseStoredVehicle,
  parseVehicleParam,
  readStoredVehicle,
  resolveVehicle,
  vehicleActions,
  writeStoredVehicle,
} from "./vehicle-settings";

const memory = () => {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    },
  };
};

describe("vehicle choice", () => {
  it("defaults to the mock", () => {
    expect(resolveVehicle("", undefined)).toEqual({ mode: "mock", lockedByAddress: false });
  });

  it("reads ?vehicle= for mock, g3 and the desk simulator, and ignores anything else", () => {
    expect(parseVehicleParam("?vehicle=g3")).toBe("g3");
    expect(parseVehicleParam("?x=1&vehicle=g3sim")).toBe("g3sim");
    expect(parseVehicleParam("?vehicle=mock")).toBe("mock");
    expect(parseVehicleParam("?vehicle=other")).toBeUndefined();
    expect(parseVehicleParam("")).toBeUndefined();
  });

  it("lets the address win over the stored choice", () => {
    expect(resolveVehicle("?vehicle=mock", "g3")).toEqual({ mode: "mock", lockedByAddress: true });
    expect(resolveVehicle("?vehicle=g3sim", "mock")).toEqual({
      mode: "g3sim",
      lockedByAddress: true,
    });
    expect(resolveVehicle("", "g3")).toEqual({ mode: "g3", lockedByAddress: false });
  });

  it("stores only mock or g3, never the simulator", () => {
    const { map, storage } = memory();
    writeStoredVehicle(storage, "g3");
    expect(JSON.parse(map.get(VEHICLE_STORAGE_KEY) ?? "{}")).toEqual({ vehicle: "g3" });
    expect(readStoredVehicle(storage)).toBe("g3");
    expect(parseStoredVehicle(JSON.stringify({ vehicle: "g3sim" }))).toBeUndefined();
  });

  it("survives broken or blocked storage", () => {
    expect(parseStoredVehicle("not json")).toBeUndefined();
    expect(parseStoredVehicle("null")).toBeUndefined();
    expect(readStoredVehicle(null)).toBeUndefined();
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredVehicle(blocked)).toBeUndefined();
    expect(() => {
      writeStoredVehicle(blocked, "g3");
    }).not.toThrow();
  });
});

const line = (state: AdapterStatus["state"], detail?: AdapterStatus["detail"]) =>
  describeVehicleStatus(detail === undefined ? { state } : { state, detail });

describe("status line", () => {
  it("is quiet while idle, connecting and setting up", () => {
    expect(line("idle").tone).toBe("quiet");
    expect(line("connecting").tone).toBe("quiet");
    expect(line("authenticating").tone).toBe("quiet");
  });

  it("is amber when something needs attention", () => {
    expect(line("auth-needed", "not-paired").tone).toBe("attention");
    expect(line("auth-needed", "rejected").tone).toBe("attention");
    expect(line("auth-needed", "pairing-timeout").tone).toBe("attention");
    expect(line("disconnected", "needs-tap").tone).toBe("attention");
    expect(line("disconnected", "link-lost").tone).toBe("attention");
  });

  it("is red only for a real error", () => {
    expect(line("error", "connect-failed").tone).toBe("error");
    expect(line("error", "no-telemetry").tone).toBe("error");
    for (const state of [
      "idle",
      "connecting",
      "authenticating",
      "connected",
      "unsupported",
    ] as const) {
      expect(line(state).tone).not.toBe("error");
    }
    expect(line("auth-needed", "not-paired").tone).not.toBe("error");
  });

  it("says why a browser is unsupported in plain words, without an error colour", () => {
    expect(line("unsupported", "ios").text).toMatch(/iPhone and iPad/);
    expect(line("unsupported", "insecure-context").text).toMatch(/HTTPS/);
    expect(line("unsupported", "no-web-bluetooth").text).toMatch(/Chrome/);
    expect(line("unsupported", "ios").tone).toBe("quiet");
  });

  it("never shows a stack trace or a raw error name", () => {
    const states: AdapterStatus[] = [
      { state: "error", detail: "protocol" },
      { state: "error", detail: "no-answer" },
      { state: "auth-needed", detail: "rejected" },
    ];
    for (const status of states) {
      expect(describeVehicleStatus(status).text).not.toMatch(/Error|undefined|\bat \w+\./);
    }
  });
});

describe("actions", () => {
  it("enables Connect when idle and the screen is not guarded", () => {
    expect(vehicleActions({ state: "idle" }, false)).toMatchObject({
      connectDisabled: false,
      connectLabel: "Connect",
      showPair: false,
    });
  });

  it("switches Connect off above the guard speed and says why", () => {
    const a = vehicleActions({ state: "idle" }, true);
    expect(a.connectDisabled).toBe(true);
    expect(a.hint).toBe(VEHICLE_TEXT.whileRiding);
  });

  it("switches Connect off while a connection is being made, and when unsupported", () => {
    expect(vehicleActions({ state: "connecting" }, false).connectDisabled).toBe(true);
    expect(vehicleActions({ state: "authenticating" }, false).connectDisabled).toBe(true);
    expect(vehicleActions({ state: "unsupported", detail: "ios" }, false).connectDisabled).toBe(
      true,
    );
  });

  it("offers Disconnect when connected and Pair only when auth is needed", () => {
    expect(vehicleActions({ state: "connected" }, false).connectLabel).toBe("Disconnect");
    expect(vehicleActions({ state: "auth-needed", detail: "not-paired" }, false).showPair).toBe(
      true,
    );
    expect(vehicleActions({ state: "disconnected" }, false).showPair).toBe(false);
  });
});

describe("words", () => {
  it("has the required plain text and no dash characters or emoji", () => {
    expect(VEHICLE_TEXT.readOnly).toBe("Reads only. Waylit never sends control commands.");
    expect(VEHICLE_TEXT.screenOn).toContain("Keep the screen on while riding");
    expect(VEHICLE_TEXT.officialApp).toMatch(/official Segway app/);
    expect(VEHICLE_TEXT.officialApp).toMatch(/unverified/);
    expect(VEHICLE_TEXT.trademark).toMatch(/Not affiliated with Segway/);
    const all = JSON.stringify(VEHICLE_TEXT);
    expect(all).not.toMatch(/[\u2013\u2014]/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
