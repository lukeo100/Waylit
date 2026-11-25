/*
 * Waylit service worker helpers. Pure functions with no browser APIs, so they can be
 * unit tested. Loaded by sw.js with importScripts, and by the tests in a sandbox.
 * It is a classic script (not a module) because importScripts cannot load modules.
 */
(function (root) {
  "use strict";

  /**
   * Bump this when sw.js, this file, offline.html or PRECACHE_URLS change. It names the
   * caches, and old caches with a different version are deleted when a new worker
   * activates.
   */
  var VERSION = "v2";

  var CACHE_PREFIX = "waylit-";
  var CACHES = {
    shell: CACHE_PREFIX + "shell-" + VERSION,
    static: CACHE_PREFIX + "static-" + VERSION,
    pages: CACHE_PREFIX + "pages-" + VERSION,
  };

  /** Cached at install. The offline page must be self contained (inline CSS, no scripts). */
  var PRECACHE_URLS = [
    "/",
    "/offline.html",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon.svg",
  ];

  var OFFLINE_URL = "/offline.html";

  /** Upper bounds so hashed assets from old deploys cannot grow the cache forever. */
  var MAX_ENTRIES = { static: 120, pages: 20 };

  /** File types served from the app's own origin that are safe to cache as static. */
  var STATIC_EXTENSIONS = /\.(?:js|css|woff2?|png|jpe?g|gif|webp|avif|svg|ico)$/i;

  /**
   * Decide what to do with a request.
   *
   * Returns one of:
   *   "navigation"  an HTML page load. Network first, fall back to cache then offline page.
   *   "static"      a same origin build asset or icon. Stale while revalidate.
   *   "bypass"      do not touch it. The browser handles it as if no worker existed.
   *
   * Bypassed on purpose, and never cached by default:
   *   - anything that is not a GET
   *   - anything on another origin, which includes every map tile server and third party API:
   *     Cesium ion (api.cesium.com and its asset hosts), Google 3D Tiles (tile.googleapis.com),
   *     OpenFreeMap (tiles.openfreemap.org) and the terrain tiles (tiles.mapterhorn.com)
   *   - /cesium/ and /maplibre/, the map renderers' own worker and WebAssembly files
   *   - /api/ routes
   *   - Next.js data requests (RSC payloads, _rsc queries) and the dev server
   *   - range requests (media)
   *
   * Map tiles and other third party content must follow the provider's terms. Many
   * providers forbid or limit storing tiles. Do not add map tile caching here unless the
   * provider's terms allow it, and then keep it to a separate, size capped cache.
   */
  function classifyRequest(input, ownOrigin) {
    var method = (input.method || "GET").toUpperCase();
    if (method !== "GET") return "bypass";

    var url;
    try {
      url = new URL(input.url);
    } catch (_error) {
      return "bypass";
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return "bypass";
    if (url.origin !== ownOrigin) return "bypass";

    var path = url.pathname;
    if (path.indexOf("/api/") === 0 || path === "/api") return "bypass";
    if (path.indexOf("/_next/webpack-hmr") === 0 || path.indexOf("/__nextjs") === 0)
      return "bypass";
    if (path.indexOf("/_next/data/") === 0 || path.indexOf("/_next/image") === 0) return "bypass";
    if (path === "/sw.js" || path === "/sw-strategy.js") return "bypass";
    // The map renderers' own files (Cesium workers and WebAssembly, the MapLibre worker). They
    // are the app's, not map content, but there are dozens of them and they would push the app's
    // own chunks out of the size capped cache. The browser's HTTP cache serves them instead.
    if (path.indexOf("/cesium/") === 0 || path.indexOf("/maplibre/") === 0) return "bypass";

    var headers = input.headers || {};
    var rsc = headers.rsc || headers.RSC;
    if (rsc || url.searchParams.has("_rsc")) return "bypass";
    if (headers.range || headers.Range) return "bypass";

    if (input.mode === "navigate") return "navigation";

    // Development builds serve unhashed chunks, so only cache build output in production.
    if (path.indexOf("/_next/static/") === 0) return "static";
    if (path.indexOf("/icons/") === 0) return "static";
    if (path === "/manifest.webmanifest") return "static";
    if (STATIC_EXTENSIONS.test(path)) return "static";
    return "bypass";
  }

  /** Whether a response is worth storing. Only complete, successful, same origin responses. */
  function isCacheableResponse(response) {
    return Boolean(response) && response.status === 200 && response.type !== "opaque";
  }

  /** Keys to delete so that at most `max` remain. Oldest first, as the cache lists them. */
  function keysToEvict(keys, max) {
    return keys.length > max ? keys.slice(0, keys.length - max) : [];
  }

  /** Names of old Waylit caches that are not part of the current version. */
  function staleCacheNames(names) {
    var current = [CACHES.shell, CACHES.static, CACHES.pages];
    return names.filter(function (name) {
      return name.indexOf(CACHE_PREFIX) === 0 && current.indexOf(name) === -1;
    });
  }

  /**
   * Validates URLs the page asks the worker to cache after first load. The worker only
   * accepts same origin URLs that classify as static, so a page cannot use the message
   * to make it fetch or store anything else.
   */
  function acceptableWarmUrls(urls, ownOrigin) {
    var accepted = [];
    if (!Array.isArray(urls)) return accepted;
    for (var i = 0; i < urls.length && accepted.length < 60; i++) {
      var raw = urls[i];
      if (typeof raw !== "string") continue;
      if (classifyRequest({ url: raw, method: "GET", mode: "no-cors" }, ownOrigin) === "static") {
        accepted.push(raw);
      }
    }
    return accepted;
  }

  root.WaylitSwStrategy = {
    VERSION: VERSION,
    CACHES: CACHES,
    PRECACHE_URLS: PRECACHE_URLS,
    OFFLINE_URL: OFFLINE_URL,
    MAX_ENTRIES: MAX_ENTRIES,
    classifyRequest: classifyRequest,
    isCacheableResponse: isCacheableResponse,
    keysToEvict: keysToEvict,
    staleCacheNames: staleCacheNames,
    acceptableWarmUrls: acceptableWarmUrls,
  };
})(typeof self !== "undefined" ? self : globalThis);
