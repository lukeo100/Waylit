import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUN_MODE,
  POSITION_SOURCE,
  SUN_MODE_STORAGE_KEY,
  createSunModeStore,
  initialSunMode,
  otherSunMode,
} from "./sun-mode";

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SUN_MODE_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("sun mode", () => {
  it("defaults to following the clock while the position is simulated", () => {
    expect(DEFAULT_SUN_MODE).toBe("follow-clock");
    expect(POSITION_SOURCE).toBe("simulated");
    expect(initialSunMode("", memoryStorage())).toBe("follow-clock");
    expect(initialSunMode("", null)).toBe("follow-clock");
  });

  it("lets the address win over the saved choice", () => {
    expect(initialSunMode("?sun=real", memoryStorage("follow-clock"))).toBe("real-sun");
    expect(initialSunMode("?sun=clock", memoryStorage("real-sun"))).toBe("follow-clock");
    expect(initialSunMode("?sun=nonsense", memoryStorage("real-sun"))).toBe("real-sun");
  });

  it("remembers the choice and tells subscribers", () => {
    const storage = memoryStorage();
    const store = createSunModeStore(
      () => "",
      () => storage,
    );
    let calls = 0;
    store.subscribe(() => (calls += 1));
    expect(store.get()).toBe("follow-clock");
    store.set(otherSunMode(store.get()));
    expect(store.get()).toBe("real-sun");
    expect(storage.getItem(SUN_MODE_STORAGE_KEY)).toBe("real-sun");
    expect(calls).toBe(1);
  });
});
