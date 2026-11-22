import { describe, expect, it, vi } from "vitest";
import { SAFETY_NOTICE_KEY, createSafetyNoticeStore } from "./safety-notice";
import type { StorageLike } from "./safety-notice";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("safety notice store", () => {
  it("is not acknowledged on first run", () => {
    expect(createSafetyNoticeStore(() => memoryStorage()).isAcknowledged()).toBe(false);
  });

  it("saves the acknowledgement and remembers it across stores", () => {
    const storage = memoryStorage();
    const first = createSafetyNoticeStore(() => storage);
    expect(first.acknowledge()).toBe(true);
    expect(storage.data.get(SAFETY_NOTICE_KEY)).toBe("1");
    expect(createSafetyNoticeStore(() => storage).isAcknowledged()).toBe(true);
  });

  it("ignores a stored value from an unknown version", () => {
    const storage = memoryStorage();
    storage.setItem(SAFETY_NOTICE_KEY, "0");
    expect(createSafetyNoticeStore(() => storage).isAcknowledged()).toBe(false);
  });

  it("works when storage is unavailable, for the current session only", () => {
    const store = createSafetyNoticeStore(() => null);
    expect(store.isAcknowledged()).toBe(false);
    expect(store.acknowledge()).toBe(false);
    expect(store.isAcknowledged()).toBe(true);
    expect(createSafetyNoticeStore(() => null).isAcknowledged()).toBe(false);
  });

  it("survives storage that throws on access", () => {
    const getStorage = (): StorageLike => {
      throw new Error("SecurityError");
    };
    const store = createSafetyNoticeStore(getStorage);
    expect(store.isAcknowledged()).toBe(false);
    expect(() => store.acknowledge()).not.toThrow();
    expect(store.isAcknowledged()).toBe(true);
  });

  it("survives storage that throws on write (quota exceeded)", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const store = createSafetyNoticeStore(() => storage);
    expect(store.acknowledge()).toBe(false);
    expect(store.isAcknowledged()).toBe(true);
  });

  it("notifies subscribers on acknowledge", () => {
    const store = createSafetyNoticeStore(() => memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.acknowledge();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.acknowledge();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
