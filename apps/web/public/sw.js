/*
 * Waylit service worker. Hand written, no dependencies.
 *
 * What it does:
 *   - Precaches a small offline shell (start page, offline page, manifest, icons) at install.
 *   - Page loads: network first, so a deploy shows up straight away. If the network
 *     fails, serve the last copy of that page, otherwise the offline page.
 *   - Build assets under /_next/static and icons: stale while revalidate. Their names
 *     contain content hashes, so a cached copy is always the right copy for its URL.
 *   - Everything else passes straight through to the network.
 *
 * What it never caches by default: /api/ routes, any request to another origin (which
 * covers map tile servers and every third party API), non GET requests and Next.js data
 * requests. NOTE ON MAP TILES: many providers restrict storing or caching their tiles.
 * Caching any third party map tiles must follow that provider's terms. Do not add it
 * here without checking them, and keep it in its own size capped cache.
 *
 * Updates: a new worker waits instead of taking over mid ride. The page shows an update
 * prompt (outside the riding screen) and sends SKIP_WAITING when the rider agrees.
 *
 * The rules live in sw-strategy.js so they can be unit tested. See docs/PWA.md.
 */
/* global WaylitSwStrategy */
importScripts("/sw-strategy.js");

var S = WaylitSwStrategy;
var ORIGIN = self.location.origin;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(S.CACHES.shell).then(function (cache) {
      return cache.addAll(S.PRECACHE_URLS);
    }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          S.staleCacheNames(names).map(function (name) {
            return caches.delete(name);
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("message", function (event) {
  var data = event.data;
  if (!data || typeof data.type !== "string") return;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  // The page lists the assets it already loaded before this worker controlled it, so the
  // first offline launch has them. Only URLs that classify as static are accepted.
  if (data.type === "CACHE_URLS") {
    var urls = S.acceptableWarmUrls(data.urls, ORIGIN);
    event.waitUntil(
      caches.open(S.CACHES.static).then(function (cache) {
        return Promise.all(
          urls.map(function (url) {
            return cache.match(url).then(function (hit) {
              return hit ? undefined : cache.add(url).catch(function () {});
            });
          }),
        );
      }),
    );
  }
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var headers = {};
  request.headers.forEach(function (value, key) {
    headers[key] = value;
  });
  var kind = S.classifyRequest(
    { url: request.url, method: request.method, mode: request.mode, headers: headers },
    ORIGIN,
  );
  if (kind === "navigation") {
    event.respondWith(networkFirstPage(request, event));
  } else if (kind === "static") {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

function networkFirstPage(request, event) {
  return fetch(request)
    .then(function (response) {
      if (S.isCacheableResponse(response)) {
        var copy = response.clone();
        event.waitUntil(
          caches
            .open(S.CACHES.pages)
            .then(function (cache) {
              return cache.put(request, copy).then(function () {
                return trim(cache, S.MAX_ENTRIES.pages);
              });
            })
            .catch(function () {}),
        );
      }
      return response;
    })
    .catch(function () {
      return offlinePage(request);
    });
}

// Look in the pages cache first so a fresh copy beats the copy precached at install.
function offlinePage(request) {
  var options = { ignoreSearch: true };
  return caches
    .open(S.CACHES.pages)
    .then(function (pages) {
      return pages.match(request, options);
    })
    .then(function (hit) {
      return (
        hit ||
        caches.open(S.CACHES.shell).then(function (shell) {
          return shell.match(request, options);
        })
      );
    })
    .then(function (hit) {
      return (
        hit ||
        caches.open(S.CACHES.shell).then(function (shell) {
          return shell.match(S.OFFLINE_URL);
        })
      );
    })
    .then(function (hit) {
      return hit || Response.error();
    });
}

function staleWhileRevalidate(request, event) {
  return caches.open(S.CACHES.static).then(function (cache) {
    // A precached copy (icons, manifest) counts as a hit too.
    return lookupStatic(cache, request).then(function (hit) {
      var refresh = fetch(request)
        .then(function (response) {
          if (!S.isCacheableResponse(response)) return response;
          var copy = response.clone();
          return cache.put(request, copy).then(function () {
            return trim(cache, S.MAX_ENTRIES.static).then(function () {
              return response;
            });
          });
        })
        .catch(function () {
          return hit || Response.error();
        });
      if (hit) {
        event.waitUntil(refresh.catch(function () {}));
        return hit;
      }
      return refresh;
    });
  });
}

function lookupStatic(cache, request) {
  return cache.match(request).then(function (hit) {
    return (
      hit ||
      caches.open(S.CACHES.shell).then(function (shell) {
        return shell.match(request);
      })
    );
  });
}

function trim(cache, max) {
  return cache.keys().then(function (keys) {
    return Promise.all(
      S.keysToEvict(keys, max).map(function (key) {
        return cache.delete(key);
      }),
    );
  });
}
