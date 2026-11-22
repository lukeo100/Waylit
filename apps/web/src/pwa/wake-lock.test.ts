import { describe, expect, it, vi } from "vitest";
import { createWakeLockController, isWakeLockSupported } from "./wake-lock";
import type { WakeLockDocumentLike, WakeLockSentinelLike } from "./wake-lock";

function fakeSentinel() {
  let onRelease: (() => void) | undefined;
  const sentinel: WakeLockSentinelLike = {
    release: vi.fn(() => Promise.resolve()),
    addEventListener: (_type, listener) => {
      onRelease = listener;
    },
  };
  return { sentinel, fireRelease: () => onRelease?.() };
}

function fakeDocument(initial = "visible") {
  const listeners = new Set<() => void>();
  const doc: WakeLockDocumentLike & { visibilityState: string } = {
    visibilityState: initial,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  return {
    doc,
    listeners,
    setVisibility(state: string) {
      doc.visibilityState = state;
      for (const listener of [...listeners]) listener();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("isWakeLockSupported", () => {
  it("is false with no wakeLock", () => {
    expect(isWakeLockSupported({})).toBe(false);
  });

  it("is true when request exists", () => {
    expect(isWakeLockSupported({ wakeLock: { request: vi.fn() } })).toBe(true);
  });
});

describe("createWakeLockController", () => {
  it("reports unsupported and does nothing without the API", () => {
    const controller = createWakeLockController(() => ({}));
    expect(controller.getStatus()).toBe("unsupported");
    controller.start();
    controller.stop();
    expect(controller.getStatus()).toBe("unsupported");
  });

  it("requests a screen lock on start and releases it on stop", async () => {
    const { sentinel } = fakeSentinel();
    const request = vi.fn(() => Promise.resolve(sentinel));
    const { doc } = fakeDocument();
    const controller = createWakeLockController(() => ({ wakeLock: { request }, document: doc }));

    controller.start();
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    expect(controller.getStatus()).toBe("active");

    controller.stop();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toBe("inactive");
  });

  it("does not request twice when started twice", async () => {
    const { sentinel } = fakeSentinel();
    const request = vi.fn(() => Promise.resolve(sentinel));
    const { doc } = fakeDocument();
    const controller = createWakeLockController(() => ({ wakeLock: { request }, document: doc }));
    controller.start();
    controller.start();
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("re-acquires when the page becomes visible after the browser released the lock", async () => {
    const first = fakeSentinel();
    const second = fakeSentinel();
    const request = vi
      .fn<() => Promise<WakeLockSentinelLike>>()
      .mockResolvedValueOnce(first.sentinel)
      .mockResolvedValueOnce(second.sentinel);
    const page = fakeDocument();
    const controller = createWakeLockController(() => ({
      wakeLock: { request },
      document: page.doc,
    }));

    controller.start();
    await flush();
    expect(controller.getStatus()).toBe("active");

    // Page goes to the background: the browser releases the lock itself.
    page.setVisibility("hidden");
    first.fireRelease();
    expect(controller.getStatus()).toBe("inactive");
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    page.setVisibility("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(controller.getStatus()).toBe("active");
  });

  it("does not request while the page is hidden", async () => {
    const request = vi.fn(() => Promise.resolve(fakeSentinel().sentinel));
    const page = fakeDocument("hidden");
    const controller = createWakeLockController(() => ({
      wakeLock: { request },
      document: page.doc,
    }));
    controller.start();
    await flush();
    expect(request).not.toHaveBeenCalled();
    page.setVisibility("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops listening for visibility changes after stop", async () => {
    const request = vi.fn(() => Promise.resolve(fakeSentinel().sentinel));
    const page = fakeDocument();
    const controller = createWakeLockController(() => ({
      wakeLock: { request },
      document: page.doc,
    }));
    controller.start();
    await flush();
    expect(page.listeners.size).toBe(1);
    controller.stop();
    expect(page.listeners.size).toBe(0);
    page.setVisibility("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("releases a lock that arrives after stop was called", async () => {
    const { sentinel } = fakeSentinel();
    let resolveRequest: (value: WakeLockSentinelLike) => void = () => undefined;
    const request = vi.fn(
      () =>
        new Promise<WakeLockSentinelLike>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const page = fakeDocument();
    const controller = createWakeLockController(() => ({
      wakeLock: { request },
      document: page.doc,
    }));
    controller.start();
    controller.stop();
    resolveRequest(sentinel);
    await flush();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toBe("inactive");
  });

  it("swallows a refused request and stays inactive", async () => {
    const request = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    const page = fakeDocument();
    const controller = createWakeLockController(() => ({
      wakeLock: { request },
      document: page.doc,
    }));
    controller.start();
    await flush();
    expect(controller.getStatus()).toBe("inactive");
  });

  it("notifies subscribers of status changes and supports unsubscribe", async () => {
    const { sentinel } = fakeSentinel();
    const request = vi.fn(() => Promise.resolve(sentinel));
    const page = fakeDocument();
    const controller = createWakeLockController(() => ({
      wakeLock: { request },
      document: page.doc,
    }));
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.start();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    controller.stop();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
