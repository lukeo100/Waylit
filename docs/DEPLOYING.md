# Deploying your own copy

> **Status: partial.** Running locally works today. The Vercel and self-host steps are outlined below and will be checked from a clean environment before the first release.

The goal is that anyone can run their own copy with their own accounts and keys. There is no shared hosted instance and no shared API key.

## 1. Requirements

All free:

- [Node.js](https://nodejs.org/) 22 LTS. The exact major version is in `.nvmrc`. With nvm, run `nvm use`.
- pnpm 10. The exact version is pinned in the `packageManager` field of `package.json`. The simplest way to get it is Corepack, which ships with Node.js: `corepack enable`.
- Git.

## 2. Run locally with no keys

```sh
git clone https://github.com/lukeo100/Waylit.git waylit
cd waylit
corepack enable
pnpm install
pnpm dev
```

Open http://localhost:3000. No `.env` file, account or API key is needed.

To check a production build locally:

```sh
pnpm build
pnpm start
```

## 3. Deploy on Vercel

1. Fork the repository on GitHub.
2. In Vercel, import the fork. Set the **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm from the lockfile, and installs the whole workspace.
3. Leave environment variables empty for a no-keys deployment, or add the optional ones from section 5.
4. Deploy.

Free Hobby plans are enough. Keep Deployment Protection on if the deployment is only for you.

## 4. Self-host

> **Proposed, not final.** The recommendation below is a proposal for the maintainer to approve. Nothing in the build is switched yet.

### Recommendation: static export

Build Waylit as a static site with Next.js static export (`output: "export"`), and serve the resulting `apps/web/out/` folder from any static web server or free static host.

Why:

- **Milestone 1 has no server.** The app is a client-side PWA with simulated GPS, mock telemetry and mock media. There are no API routes, no server rendering per request and no backend in scope.
- **Cheapest and simplest to run.** Plain files work on any web server (nginx, Caddy, Apache) and on free static hosts. There is no Node.js process to keep alive, patch or monitor.
- **Smaller attack surface.** No server code runs in production, so there is nothing server-side to exploit or misconfigure.
- **Fits the PWA.** A service worker and manifest are static files, and offline caching works the same as on Vercel.
- **Keys stay the deployer's.** Public keys are inlined at build time, so each deployer builds with their own environment. This matches the bring-your-own-keys rule.

Trade-offs to accept:

- Features that need a server are unavailable in this mode: route handlers, middleware, incremental regeneration and the built-in image optimiser. The app should avoid them in milestone 1 so the same code builds both ways.
- `NEXT_PUBLIC_*` values are fixed at build time. Changing a key means rebuilding.
- Response headers (content security policy, service worker caching) must be set in the web server config rather than in Next.js. Example configs would be added to the docs.
- HTTPS is required for service workers, geolocation and Web Bluetooth. Most static hosts provide it. A self-managed server needs a certificate, for example from Let's Encrypt.

### Alternative: Docker image

A Docker image built from Next.js standalone output runs `next start` inside a container. It supports every Next.js feature and suits a later phase if the app gains server code. It is heavier to build and run, needs a long-running process, and adds an image to maintain. It is worth revisiting if a later phase needs server features. A Docker image could also simply wrap the static export in a small web server, for people who prefer containers.

### Next steps if approved

Add a build flag for static export, check the app builds and runs in both modes in CI, and document the steps for one static host and one generic web server.

## 5. Environment variables

Every variable is optional. With all of them empty, Waylit uses its defaults, the fallback map and mock data. Names are listed in [`.env.example`](../.env.example). For local development, copy it to `apps/web/.env.local`, which is ignored by git.

| Variable | Default when empty | Purpose |
|---|---|---|
| `NEXT_PUBLIC_WAYLIT_SOURCE_URL` | The upstream repository | Link to the source code shown in the app. Point it at your fork if you change the code, which helps you meet the licence's notice requirements |
| `NEXT_PUBLIC_CESIUM_ION_TOKEN` | The MapLibre fallback map is used | Cesium ion access token. With it, production builds render Google Photorealistic 3D Tiles through Cesium ion. See section 6 |

Waylit has no Google Maps API key variable. Google's 3D tiles are reached through Cesium ion, so there is no direct Google key path and no Google billing account to set up.

Variables starting with `NEXT_PUBLIC_` are included in the browser bundle and are visible to anyone who loads the app. Only put browser-safe keys there, restricted by referrer and quota.

## 6. Optional providers

Waylit has two map providers behind one interface. You do not need a key for either to run the app.

**Fallback map (default).** MapLibre GL JS draws OpenFreeMap vector tiles with open terrain from Mapterhorn. No key, no account. It shows "OpenFreeMap", "OpenMapTiles" and "© OpenStreetMap contributors" in the credits strip. Public tile servers are shared services, so for heavy use run or sponsor your own.

**Photorealistic 3D (optional).** CesiumJS renders Google Photorealistic 3D Tiles through Cesium ion (asset 2275207).

1. Create a Cesium ion account and an access token with only the `assets:read` scope. Limit it to asset 2275207 (the Google Photorealistic 3D Tiles asset) and to the URLs your copy is deployed at, in the Cesium ion dashboard, so a copy of it found in the browser bundle is of little use. Tokens never expire, so rotate it if it leaks and watch its usage ([Cesium ion access tokens](https://cesium.com/learn/ion/cesium-ion-access-tokens/)).
2. Put it in `NEXT_PUBLIC_CESIUM_ION_TOKEN` (in `apps/web/.env.local` locally, or in your host's build settings) and rebuild. The value is public in the bundle by design, which is why the restriction matters.
3. Check the free allowance. Every page load that starts the 3D scene requests the root tileset once, and Cesium ion counts those. Check your plan's current limits and Google's and Cesium's terms before you share a deployment.

Which provider runs on a page load:

| Situation | Provider |
|---|---|
| No token | Fallback |
| Token, production build | CesiumJS |
| Token, development build (`pnpm dev`) | Fallback, to save the allowance. Add `?map=cesium` to the address to use CesiumJS |
| `?map=fallback` | Fallback, on any build |

### Terms, plans and limits you take on

When you deploy your own copy you become the customer of Cesium ion and, through it, of Google. Waylit's maintainers are not a party to those agreements and cannot accept them for you. These points come from the mapping spike report (read on 2026-11-22). The Google pages named below were re-read on 2026-11-25. Plans and terms change, so read them again before you share a deployment.

- **Non-commercial only on the free plan.** The Cesium ion Community plan is free for personal and non-commercial use, exploratory development and unfunded education. Commercial use, funded or government work, or going over the free limits needs a paid Cesium licence ([Cesium ion pricing](https://cesium.com/platform/cesium-ion/pricing/)).
- **Small free allowance.** The Community plan includes about 1,000 Google Photorealistic 3D Tiles root tileset requests a month, as does Google's own free monthly cap for the Map Tiles API ([Cesium ion pricing](https://cesium.com/platform/cesium-ion/pricing/), [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)). One root request allows up to three hours of tile streaming ([Map Tiles usage and billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)), so a ride costs about one, but every page load that starts the 3D scene can cost one. Development builds default to the fallback map for this reason.
- **Two sets of terms.** Using Google tiles through Cesium ion means you accept the [Cesium terms for Google content](https://cesium.com/legal/terms-for-google/), which repeat Google's rules, and Google's [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies) and [Maps Platform terms](https://cloud.google.com/maps-platform/terms). They include: show the Google logo and data credits unmodified and uncovered, no caching or offline copies beyond what the HTTP headers allow, no creating content from Google data (Waylit never reads heights from the tiles), no use with or near a non-Google map, and no use in an app or device embedded in a vehicle. See [ARCHITECTURE.md](ARCHITECTURE.md) for how Waylit keeps to them.
- **EEA billing addresses and safety requirements.** Google applies separate terms to customers with a billing address in the European Economic Area. The [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies) page says this, lists the EEA terms, the EEA FAQ and links to Google's [safety requirements](https://cloud.google.com/terms/maps-platform/eea-safety-requirements) without saying they cover Map Tiles. The binding wording is in Google's service specific terms. For customers outside the EEA the [service specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) put it in the Routes API and Route Optimization API sections (B.19.4.1 and B.18.5.1), and for EEA customers the [EEA service specific terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms) put it in the general terms (A.4.1). In both, a customer who provides real-time navigation, or an app intended for use during real-time driving, must follow the safety requirements. Waylit is a navigation display, so read them before you deploy it. The Map Tiles API sections of those terms do not mention the safety requirements themselves.
- **The visual effect on Google tiles is off by default.** Waylit can add a colour grade and edge glow to the 3D view (see [ARCHITECTURE.md](ARCHITECTURE.md), "Visual effects and the Google terms"). Because it changes how Google's tiles look, it stays off for Google tiles until you turn it on in your copy, and `?fx=off` always turns it off.

If CesiumJS fails (bad token, no quota, network, no WebGL) the app tries once, then switches to the fallback and shows a small amber note on the riding screen. It does not retry in a loop.

Network hosts used by the scene, in case you set a content security policy or a firewall: `api.cesium.com` and `assets.ion.cesium.com` (and Cesium ion's tile hosts), `tile.googleapis.com`, `tiles.openfreemap.org`, `tiles.mapterhorn.com`. Waylit does not ship a content security policy. The scene also uses workers (`worker-src blob:`) and WebAssembly, and `/cesium/` and `/maplibre/` must be served as plain static files. Both folders are copied into `apps/web/public` by `pnpm dev` and `pnpm build`.

Waylit's service worker never caches Google, Cesium ion, OpenFreeMap or Mapterhorn tiles. Do not add a cache in front of them unless the provider's terms allow it.

## 7. Installing the PWA

Open your deployed HTTPS URL in Chrome on Android and tap **Install app**. The steps, how to test on a phone over USB, and the browser limitations are in [PWA.md](PWA.md). Static hosts and web servers must serve `/sw.js` and `/sw-strategy.js` with `Cache-Control: no-cache`, so updates are not delayed.

## 8. Updating and troubleshooting

- **`pnpm: command not found`.** Run `corepack enable`, then open a new terminal.
- **Install fails with an engine error.** Check `node --version` matches `.nvmrc`.
- **Lockfile errors in CI.** Run `pnpm install` locally and commit the updated `pnpm-lock.yaml`.

If you hit a gap while following this guide, open an issue. Unclear deployment steps count as bugs.
