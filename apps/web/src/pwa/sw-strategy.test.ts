import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadStrategy, publicFile } from "./test-helpers";

const ORIGIN = "https://waylit.example";
const S = loadStrategy();
const classify = (
  url: string,
  extra: { method?: string; mode?: string; headers?: Record<string, string> } = {},
) => S.classifyRequest({ url, method: "GET", mode: "no-cors", ...extra }, ORIGIN);

describe("classifyRequest", () => {
  it("treats page loads as navigation", () => {
    expect(classify(`${ORIGIN}/`, { mode: "navigate" })).toBe("navigation");
    expect(classify(`${ORIGIN}/ride?x=1`, { mode: "navigate" })).toBe("navigation");
  });

  it("treats hashed build assets and icons as static", () => {
    expect(classify(`${ORIGIN}/_next/static/chunks/abc123.js`)).toBe("static");
    expect(classify(`${ORIGIN}/_next/static/media/font.woff2`)).toBe("static");
    expect(classify(`${ORIGIN}/icons/icon-192.png`)).toBe("static");
    expect(classify(`${ORIGIN}/manifest.webmanifest`)).toBe("static");
  });

  it("never touches API routes", () => {
    expect(classify(`${ORIGIN}/api/route`)).toBe("bypass");
    expect(classify(`${ORIGIN}/api/route.json`, { mode: "navigate" })).toBe("bypass");
  });

  it("never touches requests to another origin, such as map tiles", () => {
    expect(classify("https://tile.example.org/12/2048/1361.png")).toBe("bypass");
    expect(classify("https://tile.example.org/", { mode: "navigate" })).toBe("bypass");
    expect(classify("https://maps.example.com/tiles/root.json")).toBe("bypass");
  });

  it("never touches the map providers' own hosts, which Google and Cesium forbid caching", () => {
    const hosts = [
      "https://api.cesium.com/v1/assets/2275207/endpoint",
      "https://assets.ion.cesium.com/2275207/tileset.json",
      "https://assets.cesium.com/2275207/tileset.json",
      "https://tile.googleapis.com/v1/3dtiles/root.json",
      "https://tile.googleapis.com/v1/3dtiles/datasets/abc/files/x.glb",
      "https://tiles.openfreemap.org/planet",
      "https://tiles.openfreemap.org/planet/20260101_000000_pt/14/8800/5370.pbf",
      "https://tiles.mapterhorn.com/tilejson.json",
      "https://tiles.mapterhorn.com/12/2200/1342.webp",
    ];
    for (const url of hosts) {
      expect(classify(url)).toBe("bypass");
      // Even as a script, image or fetch from a worker, and even with a cacheable file type.
      expect(classify(url, { mode: "cors" })).toBe("bypass");
      expect(classify(`${url}.png`)).toBe("bypass");
    }
  });

  it("never touches the map renderers' own worker and WebAssembly files", () => {
    expect(classify(`${ORIGIN}/cesium/Workers/chunk-ABC.js`)).toBe("bypass");
    expect(classify(`${ORIGIN}/cesium/Assets/Images/ion-credit.png`)).toBe("bypass");
    expect(classify(`${ORIGIN}/cesium/ThirdParty/draco_decoder.wasm`)).toBe("bypass");
    expect(classify(`${ORIGIN}/maplibre/maplibre-gl-worker.mjs`)).toBe("bypass");
    // The app's own bundle is still static.
    expect(classify(`${ORIGIN}/_next/static/chunks/map-chunk.js`)).toBe("static");
  });

  it("never touches non GET requests", () => {
    expect(classify(`${ORIGIN}/_next/static/a.js`, { method: "POST" })).toBe("bypass");
    expect(classify(`${ORIGIN}/`, { method: "PUT", mode: "navigate" })).toBe("bypass");
  });

  it("never touches Next.js data requests", () => {
    expect(classify(`${ORIGIN}/ride?_rsc=abc`)).toBe("bypass");
    expect(classify(`${ORIGIN}/ride`, { headers: { rsc: "1" } })).toBe("bypass");
    expect(classify(`${ORIGIN}/_next/data/build/ride.json`)).toBe("bypass");
    expect(classify(`${ORIGIN}/_next/image?url=x`)).toBe("bypass");
  });

  it("never touches range requests, the worker scripts or unknown file types", () => {
    expect(classify(`${ORIGIN}/icons/a.png`, { headers: { range: "bytes=0-1" } })).toBe("bypass");
    expect(classify(`${ORIGIN}/sw.js`)).toBe("bypass");
    expect(classify(`${ORIGIN}/sw-strategy.js`)).toBe("bypass");
    expect(classify(`${ORIGIN}/some/data.bin`)).toBe("bypass");
  });

  it("ignores non http URLs and garbage", () => {
    expect(classify("chrome-extension://abc/x.js")).toBe("bypass");
    expect(classify("not a url")).toBe("bypass");
  });
});

describe("cache helpers", () => {
  it("names caches with the version and a waylit prefix", () => {
    expect(S.CACHES.shell).toBe(`waylit-shell-${S.VERSION}`);
    expect(S.CACHES.static).toBe(`waylit-static-${S.VERSION}`);
    expect(S.CACHES.pages).toBe(`waylit-pages-${S.VERSION}`);
  });

  it("only caches complete successful non opaque responses", () => {
    expect(S.isCacheableResponse({ status: 200, type: "basic" })).toBe(true);
    expect(S.isCacheableResponse({ status: 404, type: "basic" })).toBe(false);
    expect(S.isCacheableResponse({ status: 206, type: "basic" })).toBe(false);
    expect(S.isCacheableResponse({ status: 200, type: "opaque" })).toBe(false);
    expect(S.isCacheableResponse(null)).toBe(false);
  });

  it("evicts the oldest keys above the cap", () => {
    expect([...S.keysToEvict(["a", "b", "c", "d"], 3)]).toEqual(["a"]);
    expect([...S.keysToEvict(["a", "b"], 3)]).toEqual([]);
    expect([...S.keysToEvict(["a", "b", "c"], 0)]).toEqual(["a", "b", "c"]);
  });

  it("deletes only old Waylit caches", () => {
    const names = [
      S.CACHES.shell,
      S.CACHES.static,
      "waylit-static-v0",
      "waylit-pages-v0",
      "other-app-v1",
    ];
    expect([...S.staleCacheNames(names)]).toEqual(["waylit-static-v0", "waylit-pages-v0"]);
  });

  it("accepts only static same origin URLs for page requested warming", () => {
    const urls = [
      `${ORIGIN}/_next/static/chunks/a.js`,
      `${ORIGIN}/api/secret`,
      "https://tile.example.org/1/2/3.png",
      42,
      `${ORIGIN}/ride`,
    ];
    expect([...S.acceptableWarmUrls(urls, ORIGIN)]).toEqual([`${ORIGIN}/_next/static/chunks/a.js`]);
    expect([...S.acceptableWarmUrls("nope", ORIGIN)]).toEqual([]);
  });

  it("precaches the offline page and the manifest", () => {
    expect(S.PRECACHE_URLS).toContain(S.OFFLINE_URL);
    expect(S.PRECACHE_URLS).toContain("/manifest.webmanifest");
  });
});

describe("precache list", () => {
  it("only lists files that exist in public, or the start page and manifest route", () => {
    const routes = new Set(["/", "/manifest.webmanifest"]);
    for (const url of S.PRECACHE_URLS) {
      if (routes.has(url)) continue;
      expect(() => readFileSync(publicFile(url.slice(1)))).not.toThrow();
    }
  });
});
