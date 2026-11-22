import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { loadStrategy, readPublic } from "./test-helpers";

/**
 * Runs the real public/sw.js in a sandbox with fake Cache Storage, fetch and events, and
 * checks the behaviour that matters: what it caches, what it ignores, and offline fallback.
 */

const ORIGIN = "https://waylit.example";
const S = loadStrategy();

class FakeResponse {
  constructor(
    readonly body: string,
    readonly status = 200,
    readonly type = "basic",
  ) {}
  clone() {
    return this;
  }
  static error() {
    return new FakeResponse("", 0, "error");
  }
}

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
  headers: { forEach(callback: (value: string, key: string) => void): void };
}

function request(url: string, init: { method?: string; mode?: string } = {}): FakeRequest {
  return {
    url,
    method: init.method ?? "GET",
    mode: init.mode ?? "no-cors",
    headers: { forEach: () => undefined },
  };
}

const urlOf = (input: string | { url: string }) => (typeof input === "string" ? input : input.url);

class FakeCache {
  readonly entries = new Map<string, FakeResponse>();
  match(input: string | { url: string }, options?: { ignoreSearch?: boolean }) {
    const strip = (u: string) => (options?.ignoreSearch ? (u.split("?")[0] ?? u) : u);
    const wanted = strip(urlOf(input));
    for (const [key, value] of this.entries) {
      if (strip(key) === wanted || strip(key) === new URL(wanted, ORIGIN).href) {
        return Promise.resolve(value);
      }
    }
    return Promise.resolve(undefined);
  }
  put(input: string | { url: string }, response: FakeResponse) {
    this.entries.set(urlOf(input), response);
    return Promise.resolve();
  }
  add(input: string) {
    return Promise.resolve().then(() =>
      this.put(new URL(input, ORIGIN).href, new FakeResponse(`fetched ${input}`)),
    );
  }
  addAll(inputs: string[]) {
    return Promise.all(inputs.map((input) => this.add(input)));
  }
  keys() {
    return Promise.resolve([...this.entries.keys()].map((url) => ({ url })));
  }
  delete(input: string | { url: string }) {
    return Promise.resolve(this.entries.delete(urlOf(input)));
  }
}

function boot(network: (url: string) => Promise<FakeResponse>) {
  const stores = new Map<string, FakeCache>();
  const open = (name: string) => {
    let cache = stores.get(name);
    if (!cache) {
      cache = new FakeCache();
      stores.set(name, cache);
    }
    return Promise.resolve(cache);
  };
  const handlers = new Map<string, (event: unknown) => void>();
  const claim = vi.fn(() => Promise.resolve());
  const skipWaiting = vi.fn();
  // In a worker, `self` is the global object, so the helpers' export lands on it.
  const globals: Record<string, unknown> = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      handlers.set(type, handler),
    clients: { claim },
    skipWaiting,
    caches: {
      open,
      keys: () => Promise.resolve([...stores.keys()]),
      delete: (name: string) => Promise.resolve(stores.delete(name)),
      match: async (input: string | { url: string }) => {
        for (const cache of stores.values()) {
          const hit = await cache.match(input);
          if (hit) return hit;
        }
        return undefined;
      },
    },
    fetch: (input: { url: string }) => network(input.url),
    Response: FakeResponse,
    URL,
    Promise,
    Array,
    importScripts: (file: string) => {
      if (file !== "/sw-strategy.js") throw new Error(`unexpected import ${file}`);
      vm.runInContext(readPublic("sw-strategy.js"), context);
    },
  };
  globals.self = globals;
  const context = vm.createContext(globals);
  vm.runInContext(readPublic("sw.js"), context);

  async function dispatch(type: string, event: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    const full = { ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) };
    handlers.get(type)?.(full);
    await Promise.all(waits);
  }

  async function fetchEvent(req: FakeRequest) {
    let response: Promise<FakeResponse> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers.get("fetch")?.({
      request: req,
      respondWith: (p: Promise<FakeResponse>) => {
        response = p;
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const result = response ? await response : undefined;
    await Promise.all(waits);
    return { handled: response !== undefined, response: result };
  }

  return { stores, handlers, dispatch, fetchEvent, claim, skipWaiting };
}

describe("sw.js", () => {
  it("precaches the shell at install", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("net")));
    await sw.dispatch("install", {});
    const shell = sw.stores.get(S.CACHES.shell);
    expect([...(shell?.entries.keys() ?? [])].sort()).toEqual(
      S.PRECACHE_URLS.map((u) => new URL(u, ORIGIN).href).sort(),
    );
  });

  it("deletes old Waylit caches and claims clients on activate", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("net")));
    await sw.stores.set("waylit-static-v0", new FakeCache());
    await sw.stores.set("unrelated", new FakeCache());
    await sw.stores.set(S.CACHES.static, new FakeCache());
    await sw.dispatch("activate", {});
    expect([...sw.stores.keys()].sort()).toEqual([S.CACHES.static, "unrelated"].sort());
    expect(sw.claim).toHaveBeenCalled();
  });

  it("does not take over until asked (update flow)", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("net")));
    await sw.dispatch("install", {});
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    await sw.dispatch("message", { data: { type: "SKIP_WAITING" } });
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("ignores map tile, API and non GET requests", async () => {
    const network = vi.fn(() => Promise.resolve(new FakeResponse("net")));
    const sw = boot(network);
    for (const req of [
      request("https://tile.example.org/12/1/2.png"),
      request(`${ORIGIN}/api/thing`),
      request(`${ORIGIN}/_next/static/a.js`, { method: "POST" }),
    ]) {
      expect((await sw.fetchEvent(req)).handled).toBe(false);
    }
    expect(network).not.toHaveBeenCalled();
    expect([...sw.stores.values()].every((cache) => cache.entries.size === 0)).toBe(true);
  });

  it("serves pages network first and keeps a copy", async () => {
    const sw = boot((url) => Promise.resolve(new FakeResponse(`live ${url}`)));
    const { response } = await sw.fetchEvent(request(`${ORIGIN}/`, { mode: "navigate" }));
    expect(response?.body).toBe(`live ${ORIGIN}/`);
    expect(sw.stores.get(S.CACHES.pages)?.entries.has(`${ORIGIN}/`)).toBe(true);
  });

  it("falls back to the saved page, ignoring the query, when offline", async () => {
    let online = true;
    const sw = boot((url) =>
      online
        ? Promise.resolve(new FakeResponse(`live ${url}`))
        : Promise.reject(new Error("offline")),
    );
    await sw.fetchEvent(request(`${ORIGIN}/`, { mode: "navigate" }));
    online = false;
    const { response } = await sw.fetchEvent(
      request(`${ORIGIN}/?source=pwa`, { mode: "navigate" }),
    );
    expect(response?.body).toBe(`live ${ORIGIN}/`);
  });

  it("falls back to the offline page for a page never visited", async () => {
    const sw = boot(() => Promise.reject(new Error("offline")));
    await sw.dispatch("install", {});
    const { response } = await sw.fetchEvent(request(`${ORIGIN}/ride`, { mode: "navigate" }));
    expect(response?.body).toBe("fetched /offline.html");
  });

  it("does not cache an error page", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("nope", 500)));
    await sw.fetchEvent(request(`${ORIGIN}/ride`, { mode: "navigate" }));
    expect(sw.stores.get(S.CACHES.pages)?.entries.size ?? 0).toBe(0);
  });

  it("serves static assets stale while revalidate", async () => {
    let version = 1;
    const network = vi.fn(() => Promise.resolve(new FakeResponse(`v${version}`)));
    const sw = boot(network);
    const asset = request(`${ORIGIN}/_next/static/chunks/a.js`);

    const first = await sw.fetchEvent(asset);
    expect(first.response?.body).toBe("v1");

    version = 2;
    const second = await sw.fetchEvent(asset);
    expect(second.response?.body).toBe("v1");
    expect(network).toHaveBeenCalledTimes(2);

    const third = await sw.fetchEvent(asset);
    expect(third.response?.body).toBe("v2");
  });

  it("serves a cached static asset when the network is down", async () => {
    let online = true;
    const sw = boot(() =>
      online ? Promise.resolve(new FakeResponse("ok")) : Promise.reject(new Error("offline")),
    );
    const asset = request(`${ORIGIN}/icons/icon-192.png`);
    await sw.fetchEvent(asset);
    online = false;
    expect((await sw.fetchEvent(asset)).response?.body).toBe("ok");
  });

  it("serves a precached icon when offline, even if never fetched at runtime", async () => {
    let online = true;
    const sw = boot((url) =>
      online
        ? Promise.resolve(new FakeResponse(`fetched ${url}`))
        : Promise.reject(new Error("offline")),
    );
    await sw.dispatch("install", {});
    online = false;
    const { response } = await sw.fetchEvent(request(`${ORIGIN}/icons/icon.svg`));
    expect(response?.body).toBe("fetched /icons/icon.svg");
  });

  it("caps the static cache", async () => {
    const sw = boot((url) => Promise.resolve(new FakeResponse(url)));
    const max = 120;
    for (let i = 0; i < max + 5; i++) {
      await sw.fetchEvent(request(`${ORIGIN}/_next/static/chunks/${i}.js`));
    }
    expect(sw.stores.get(S.CACHES.static)?.entries.size).toBe(max);
  });

  it("warms only acceptable URLs sent by the page", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("net")));
    await sw.dispatch("message", {
      data: {
        type: "CACHE_URLS",
        urls: [
          `${ORIGIN}/_next/static/chunks/a.js`,
          "https://tile.example.org/1.png",
          `${ORIGIN}/api/x`,
        ],
      },
    });
    expect([...(sw.stores.get(S.CACHES.static)?.entries.keys() ?? [])]).toEqual([
      `${ORIGIN}/_next/static/chunks/a.js`,
    ]);
  });
});
