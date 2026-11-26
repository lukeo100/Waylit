import { describe, expect, it } from "vitest";
import {
  MAP_SETTINGS_STORAGE_KEY,
  MAP_SETTINGS_TEXT,
  GROUND_RANGE_METRES,
  createMapSettingsStore,
  isFreeRide,
  parseGpsChoice,
  mapSettingsModel,
  parseMapSettings,
  readMapSettings,
  sheetShouldClose,
  type SettingsStorage,
} from "./map-settings";

function memoryStorage(initial?: string): SettingsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(MAP_SETTINGS_STORAGE_KEY, initial);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const blocked: SettingsStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

describe("parseMapSettings", () => {
  it("reads a valid value", () => {
    expect(parseMapSettings('{"map":"cesium","fx":"low"}')).toEqual({ map: "cesium", fx: "low" });
    expect(parseMapSettings('{"map":"fallback"}')).toEqual({ map: "fallback" });
  });

  it("drops anything unknown, broken or missing", () => {
    expect(parseMapSettings(null)).toEqual({});
    expect(parseMapSettings("")).toEqual({});
    expect(parseMapSettings("not json")).toEqual({});
    expect(parseMapSettings("42")).toEqual({});
    expect(parseMapSettings('{"map":"mapbox","fx":"max"}')).toEqual({});
    expect(parseMapSettings('{"map":5,"fx":true}')).toEqual({});
  });
});

describe("persistence", () => {
  it("saves a choice and reads it back in a new store", () => {
    const storage = memoryStorage();
    const first = createMapSettingsStore(() => storage);
    first.set({ map: "cesium" });
    first.set({ fx: "high" });
    expect(JSON.parse(storage.data.get(MAP_SETTINGS_STORAGE_KEY)!)).toEqual({
      map: "cesium",
      fx: "high",
    });
    const second = createMapSettingsStore(() => storage);
    expect(second.get()).toEqual({ map: "cesium", fx: "high" });
  });

  it("keeps a stable object until something changes, and tells listeners", () => {
    const store = createMapSettingsStore(() => memoryStorage());
    const a = store.get();
    expect(store.get()).toBe(a);
    let calls = 0;
    const off = store.subscribe(() => (calls += 1));
    store.set({ map: "fallback" });
    expect(calls).toBe(1);
    expect(store.get()).not.toBe(a);
    off();
    store.set({ map: "cesium" });
    expect(calls).toBe(1);
  });

  it("still works for this page when storage is blocked or missing", () => {
    expect(readMapSettings(blocked)).toEqual({});
    const store = createMapSettingsStore(() => blocked);
    expect(() => store.set({ map: "cesium" })).not.toThrow();
    expect(store.get()).toEqual({ map: "cesium" });
    const none = createMapSettingsStore(() => null);
    none.set({ fx: "low" });
    expect(none.get()).toEqual({ fx: "low" });
  });
});

describe("mapSettingsModel", () => {
  const token = "token-for-tests";
  const base = { search: "", token, nodeEnv: "production" as string | undefined };

  it("defaults: Google in production with a token, fallback in development, effect off on Google", () => {
    const prod = mapSettingsModel({ ...base, settings: {} });
    expect(prod).toMatchObject({ map: "cesium", fx: "off", googleAvailable: true });
    const dev = mapSettingsModel({ ...base, nodeEnv: "development", settings: {} });
    expect(dev).toMatchObject({ map: "fallback", fx: "high" });
  });

  it("uses the saved choice, and the address beats it", () => {
    expect(mapSettingsModel({ ...base, settings: { map: "fallback" } }).map).toBe("fallback");
    expect(
      mapSettingsModel({ ...base, nodeEnv: "development", settings: { map: "cesium" } }).map,
    ).toBe("cesium");
    const locked = mapSettingsModel({
      ...base,
      search: "?map=fallback",
      settings: { map: "cesium" },
    });
    expect(locked).toMatchObject({ map: "fallback", mapLockedByAddress: true });
    const fx = mapSettingsModel({ ...base, search: "?fx=low", settings: { fx: "high" } });
    expect(fx).toMatchObject({ fx: "low", fxLockedByAddress: true });
    const free = mapSettingsModel({ ...base, settings: { fx: "high" } });
    expect(free).toMatchObject({ fx: "high", fxLockedByAddress: false, mapLockedByAddress: false });
  });

  it("disables Google without a token and shows the fallback, whatever was saved", () => {
    for (const blank of [undefined, "", "  "]) {
      const model = mapSettingsModel({ ...base, token: blank, settings: { map: "cesium" } });
      expect(model.googleAvailable).toBe(false);
      expect(model.map).toBe("fallback");
      expect(model.selection.reason).toBe("no-token");
    }
    expect(MAP_SETTINGS_TEXT.noToken).toMatch(/no token|has none/);
  });

  it("mentions the Cesium ion quota in plain words", () => {
    expect(MAP_SETTINGS_TEXT.quota).toContain("1,000 root requests per month");
    expect(MAP_SETTINGS_TEXT.quota).toContain("Community plan");
  });
});

describe("the guard closes the sheet", () => {
  it("closes an open sheet when the speed guard turns on, and leaves the rest alone", () => {
    expect(sheetShouldClose(true, true)).toBe(true);
    expect(sheetShouldClose(true, false)).toBe(false);
    expect(sheetShouldClose(false, true)).toBe(false);
  });
});

describe("position source setting", () => {
  const base = { token: undefined, nodeEnv: "development" } as const;

  it("reads ?gps= from the address, ignoring junk", () => {
    expect(parseGpsChoice("?gps=live")).toBe("live");
    expect(parseGpsChoice("?gps=SIM")).toBe("sim");
    expect(parseGpsChoice("?gps=replay")).toBe("replay");
    expect(parseGpsChoice("?gps=nope")).toBeUndefined();
    expect(parseGpsChoice("")).toBeUndefined();
  });

  it("defaults to the simulator, so nothing asks for location unprompted", () => {
    const m = mapSettingsModel({ ...base, search: "", settings: {} });
    expect(m.gps).toBe("sim");
    expect(m.freeRide).toBe(false);
    expect(m.gpsLockedByAddress).toBe(false);
  });

  it("uses the saved choice, and the address beats it", () => {
    const saved = mapSettingsModel({ ...base, search: "", settings: { gps: "live" } });
    expect(saved.gps).toBe("live");
    expect(saved.freeRide).toBe(true);
    const addr = mapSettingsModel({ ...base, search: "?gps=sim", settings: { gps: "live" } });
    expect(addr.gps).toBe("sim");
    expect(addr.gpsLockedByAddress).toBe(true);
    expect(mapSettingsModel({ ...base, search: "?gps=replay", settings: {} }).freeRide).toBe(true);
  });

  it("treats only the simulator as a routed ride", () => {
    expect(isFreeRide("sim")).toBe(false);
    expect(isFreeRide("live")).toBe(true);
    expect(isFreeRide("replay")).toBe(true);
  });

  it("saves and restores the position source and the ground height", () => {
    const storage = memoryStorage();
    const first = createMapSettingsStore(() => storage);
    first.set({ gps: "live" });
    first.set({ groundMetres: 120 });
    const second = createMapSettingsStore(() => storage);
    expect(second.get()).toEqual({ gps: "live", groundMetres: 120 });
    second.set({ groundMetres: undefined });
    expect(createMapSettingsStore(() => storage).get().groundMetres).toBeUndefined();
  });

  it("drops bad saved values, including a ground height out of range", () => {
    expect(parseMapSettings('{"gps":"replay"}')).toEqual({});
    expect(parseMapSettings('{"gps":"banana"}')).toEqual({});
    expect(parseMapSettings(`{"groundMetres":${GROUND_RANGE_METRES.max + 1}}`)).toEqual({});
    expect(parseMapSettings(`{"groundMetres":${GROUND_RANGE_METRES.min - 1}}`)).toEqual({});
    expect(parseMapSettings('{"groundMetres":"85"}')).toEqual({});
    expect(parseMapSettings('{"groundMetres":85}')).toEqual({ groundMetres: 85 });
  });
});
