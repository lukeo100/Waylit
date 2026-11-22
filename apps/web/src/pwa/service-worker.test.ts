import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { loadedStaticUrls, shouldRegister, watchForUpdates } from "./service-worker";
import type { ContainerLike, RegistrationLike, WorkerLike } from "./service-worker";

function fakeWorker(state = "installing") {
  const listeners: (() => void)[] = [];
  const worker: WorkerLike & { postMessage: Mock<(message: unknown) => void> } = {
    state,
    postMessage: vi.fn<(message: unknown) => void>(),
    addEventListener: (_type, listener) => listeners.push(listener),
  };
  return {
    worker,
    setState(next: string) {
      worker.state = next;
      for (const listener of listeners) listener();
    },
  };
}

function fakeContainer(controller: unknown) {
  const listeners: (() => void)[] = [];
  const container: ContainerLike = {
    controller,
    register: vi.fn(),
    addEventListener: (_type, listener) => listeners.push(listener),
  };
  return { container, fireControllerChange: () => listeners.forEach((listener) => listener()) };
}

function fakeRegistration() {
  const listeners: (() => void)[] = [];
  const registration: RegistrationLike = {
    waiting: null,
    installing: null,
    addEventListener: (_type, listener) => listeners.push(listener),
    update: () => Promise.resolve(),
  };
  return { registration, fireUpdateFound: () => listeners.forEach((listener) => listener()) };
}

describe("shouldRegister", () => {
  it("registers only in production with worker support", () => {
    expect(shouldRegister({ production: true, container: {} })).toBe(true);
    expect(shouldRegister({ production: false, container: {} })).toBe(false);
    expect(shouldRegister({ production: true, container: undefined })).toBe(false);
  });
});

describe("watchForUpdates", () => {
  it("offers an update when a new worker finishes installing and a worker already controls the page", () => {
    const { container } = fakeContainer({});
    const { registration, fireUpdateFound } = fakeRegistration();
    const onReady = vi.fn();
    watchForUpdates(container, registration, vi.fn(), onReady);

    const next = fakeWorker();
    registration.installing = next.worker;
    fireUpdateFound();
    expect(onReady).not.toHaveBeenCalled();
    next.setState("installed");
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("stays quiet on the very first install", () => {
    const { container } = fakeContainer(null);
    const { registration, fireUpdateFound } = fakeRegistration();
    const onReady = vi.fn();
    watchForUpdates(container, registration, vi.fn(), onReady);
    const next = fakeWorker();
    registration.installing = next.worker;
    fireUpdateFound();
    next.setState("installed");
    expect(onReady).not.toHaveBeenCalled();
  });

  it("offers an update that was already waiting when the page loaded", () => {
    const { container } = fakeContainer({});
    const { registration } = fakeRegistration();
    registration.waiting = fakeWorker("installed").worker;
    const onReady = vi.fn();
    watchForUpdates(container, registration, vi.fn(), onReady);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("applying sends SKIP_WAITING and reloads once on controller change", () => {
    const { container, fireControllerChange } = fakeContainer({});
    const { registration } = fakeRegistration();
    const waiting = fakeWorker("installed");
    registration.waiting = waiting.worker;
    const reload = vi.fn();
    let apply: () => void = () => undefined;
    watchForUpdates(container, registration, reload, (fn) => {
      apply = fn;
    });

    apply();
    expect(waiting.worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    fireControllerChange();
    fireControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("loadedStaticUrls", () => {
  it("keeps same origin build assets only, without duplicates", () => {
    const origin = "https://waylit.example";
    const urls = loadedStaticUrls(
      [
        { name: `${origin}/_next/static/chunks/a.js` },
        { name: `${origin}/_next/static/chunks/a.js` },
        { name: `${origin}/api/thing` },
        { name: "https://tiles.example/1/2/3.png" },
        { name: `${origin}/_next/static/css/b.css` },
      ],
      origin,
    );
    expect(urls).toEqual([
      `${origin}/_next/static/chunks/a.js`,
      `${origin}/_next/static/css/b.css`,
    ]);
  });
});
