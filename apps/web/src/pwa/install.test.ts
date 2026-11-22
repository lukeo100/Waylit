import { describe, expect, it, vi } from "vitest";
import { createInstallPromptStore, installHint } from "./install";
import type { BeforeInstallPromptEvent } from "./install";

class FakeTarget {
  private readonly handlers = new Map<string, Set<(event: Event) => void>>();
  addEventListener(type: string, handler: (event: Event) => void) {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler);
    this.handlers.set(type, set);
  }
  removeEventListener(type: string, handler: (event: Event) => void) {
    this.handlers.get(type)?.delete(handler);
  }
  dispatch(type: string, event: Event) {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }
  count(type: string) {
    return this.handlers.get(type)?.size ?? 0;
  }
}

function installEvent(outcome: "accepted" | "dismissed") {
  const event = {
    preventDefault: vi.fn(),
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  };
  return event as unknown as BeforeInstallPromptEvent & typeof event;
}

describe("installHint", () => {
  it("returns installed when standalone", () => {
    expect(installHint({ userAgent: "anything", standalone: true })).toBe("installed");
  });

  it("returns the iOS hint for iPhone", () => {
    expect(
      installHint({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", standalone: false }),
    ).toBe("ios");
  });

  it("returns the generic hint otherwise", () => {
    expect(installHint({ userAgent: "Mozilla/5.0 (Linux; Android 14)", standalone: false })).toBe(
      "generic",
    );
  });
});

describe("install prompt store", () => {
  it("starts unavailable and captures the event", () => {
    const store = createInstallPromptStore();
    const target = new FakeTarget();
    store.attach(target as unknown as Window);
    expect(store.getState()).toBe("unavailable");

    const event = installEvent("accepted");
    target.dispatch("beforeinstallprompt", event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(store.getState()).toBe("available");
  });

  it("prompts once and reports the choice", async () => {
    const store = createInstallPromptStore();
    const target = new FakeTarget();
    store.attach(target as unknown as Window);
    const event = installEvent("accepted");
    target.dispatch("beforeinstallprompt", event);

    await expect(store.prompt()).resolves.toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(store.getState()).toBe("unavailable");
    await expect(store.prompt()).resolves.toBe(false);
  });

  it("reports a dismissed prompt", async () => {
    const store = createInstallPromptStore();
    const target = new FakeTarget();
    store.attach(target as unknown as Window);
    target.dispatch("beforeinstallprompt", installEvent("dismissed"));
    await expect(store.prompt()).resolves.toBe(false);
  });

  it("moves to installed on appinstalled and notifies subscribers", () => {
    const store = createInstallPromptStore();
    const target = new FakeTarget();
    store.attach(target as unknown as Window);
    const listener = vi.fn();
    store.subscribe(listener);
    target.dispatch("beforeinstallprompt", installEvent("accepted"));
    target.dispatch("appinstalled", new Event("appinstalled"));
    expect(store.getState()).toBe("installed");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("removes its listeners on cleanup", () => {
    const store = createInstallPromptStore();
    const target = new FakeTarget();
    const detach = store.attach(target as unknown as Window);
    expect(target.count("beforeinstallprompt")).toBe(1);
    detach();
    expect(target.count("beforeinstallprompt")).toBe(0);
    expect(target.count("appinstalled")).toBe(0);
  });
});
