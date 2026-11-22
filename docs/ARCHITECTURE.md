# Architecture

Waylit is a pnpm workspace monorepo. The web app is one consumer of a set of small shared packages. A later Expo app will be a second consumer of the same packages, so anything that is not specific to the browser lives outside `apps/web`.

This page describes what exists today. The map provider and design system packages are still mostly interfaces and tokens, and fill in as the milestone 1 tasks land (see [AGENT_BRIEF.md](AGENT_BRIEF.md)).

## Layout

```
apps/
  web/                 Next.js App Router app (the PWA). Rendering, pages, browser APIs.
packages/
  core/                Navigation types, units, geo helpers, simulated GPS, smoothing, media model and mock tracks. No DOM, no React.
  vehicle/             Read-only vehicle interface, mock Ninebot MAX G3 adapter, energy model and speed fallback. No DOM, no React.
  map-provider/        Map provider interface types. No DOM, no React, no provider SDKs.
  ui-tokens/           Design tokens as TypeScript values plus a CSS variables file.
```

## PWA shell

The installable shell lives in `apps/web` because it depends on browser APIs. See [PWA.md](PWA.md) for behaviour and testing.

```
apps/web/
  public/
    sw.js, sw-strategy.js    Hand written service worker and its pure rules
    offline.html             Self contained offline page
    icons/                   Generated app icons
  scripts/generate-icons.mjs Dependency free icon generator
  src/app/manifest.ts        Web app manifest (from design tokens)
  src/app/ride/              Placeholder riding screen: full screen, no chrome, wake lock
  src/pwa/                   Plain TypeScript logic: wake lock, install, update flow, safety notice, orientation
  src/components/            Thin React wrappers: install button, safety notice, rotate prompt, worker registrar
```

Logic sits in `src/pwa` as framework free modules that take their browser objects as arguments, so Vitest can test them with fakes. The components only wire those modules to React. The ride screen calls `useWakeLock`. Nothing here moves into `packages/*`, because it all needs the browser.

## Dependency rules

```
apps/web ──> core, vehicle, map-provider, ui-tokens
vehicle ──> core
map-provider ──> core
core, ui-tokens ──> nothing
```

- **Shared packages stay platform neutral.** No DOM globals, no React, no Next.js. The shared ESLint config blocks `window`, `document`, `navigator` and `localStorage` in `packages/*`.
- **Navigation logic never imports rendering.** `core` knows about positions, routes and progress. It does not know a map or a 3D scene exists.
- **Providers stay behind the interface.** `map-provider` defines what the app needs from any map or 3D tile provider. Provider SDK types (CesiumJS, MapLibre or others) belong in a provider implementation, never in shared types. The provider choice is made by the mapping spike (task 3), so no implementation exists yet.
- **Vehicles stay behind the interface.** `vehicle` exposes telemetry and connection state only. It has no methods that send commands to a vehicle, and must not gain any without a maintainer agreement in an issue. Every telemetry field is optional, and the app falls back to GPS-derived values when one is missing. GPS speed and vehicle speed are separate values.
- **Tokens are the single source of visual values.** `ui-tokens/src/tokens.ts` is the source of truth. `tokens.css` mirrors it as CSS custom properties for the web, and a test fails if the two drift. The web app maps the variables into its Tailwind theme. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Simulation layer

Milestone 1 runs on simulated inputs. The simulation lives in the shared packages, not in the web app, so the later Expo app can reuse all of it. Only the code that touches browser APIs stays in `apps/web/src/media`.

### Simulated GPS (`packages/core`)

- `demo-route.ts` holds an original closed loop of about 4.2 km as plain GeoJSON (a `LineString` with `[longitude, latitude]` coordinates) plus hand-written instructions. The loop is in an open public area of Berlin, far from any maintainer location. Its origin is recorded in the file header and in [THIRD_PARTY.md](THIRD_PARTY.md).
- `GpsSimulator` moves a virtual rider along any path. The rider accelerates to a cruise speed, slows for corners, and stops at the end, or loops. Each second a pretend receiver adds noise, and the smoothing filters turn that into the fixes the app uses: an alpha-beta (constant gain Kalman) filter for position, and low-pass filters for speed and heading, in `smoothing.ts`.
- Time comes from an injected `Clock`. The simulator has no timers: the caller calls `update()` once per frame or once per second and it catches up. Playback speed, pause and resume are supported, and a fixed seed makes the noise repeatable. Tests use `createManualClock`.
- `getTruth()` and `getMotion()` expose the rider's true speed and simulated elapsed time, which is what the mock vehicle reads.

### Vehicle telemetry (`packages/vehicle`)

- `createMockVehicleAdapter` implements the read-only `VehicleAdapter` interface. It imitates a Segway Ninebot MAX G3: battery percent, estimated range, trip distance, trip duration, odometer and a vehicle speed that is separate from GPS speed. The reference figures and their sources are in `spec.ts`.
- The default speed limit is 25 km/h. It is a setting, not a property of the vehicle, and the mock never reports more than the limit.
- The energy model in `energy.ts` is fitted through the maker's two claimed range points (80 km at 15 km/h and 65 km at 25 km/h), then scaled by a real-world factor of 1.5 and a small constant draw. It is a plausible mock, not a physical model.
- `selectSpeed` is the fallback selector. Vehicle speed is used when it is present and fresh. If telemetry is missing, has no speed, is invalid or is older than two seconds, GPS speed is used instead and the result says why. GPS speed is ignored too once it is older than five seconds. The result also says which source it used.
- The adapter has no method that sends anything to a vehicle and uses no Bluetooth. Its `tick()`, `startTrip()` and `setOmittedFields()` controls exist only on the mock type, to drive tests and demos.

### Mock media

- `packages/core` holds the media model: `MediaTrack`, `MediaPlayer` (play, pause, toggle, next, previous, seek and progress, driven by the injected clock) and five invented tracks in `mock-media.ts`. Cover art is generated as SVG by `artwork.ts`. Nothing is a recording, and no real artist or service is involved.
- `apps/web/src/media` is the browser side. `mediaSession.ts` mirrors the player to the Media Session API (metadata, artwork, position and the play, pause, next track and previous track handlers). `toneEngine.ts` synthesises each track with Web Audio and routes it through a media element so browsers treat the page as playing media. `useMockMedia.ts` ties them together for the HUD to use. None of it draws any UI.

## How packages are consumed

The shared packages ship TypeScript source with no build step. Each `package.json` points its `exports` at `src/index.ts`. The web app lists them in `transpilePackages` in `next.config.ts`, so Next.js compiles them with the app. Vitest and `tsc` read the source directly. This keeps the setup to one install and one build.

When the Expo app arrives, Metro can consume the same source packages. If that proves awkward, a small build step can be added per package without changing the public interfaces.

## Tooling

| Concern | Tool | Where configured |
|---|---|---|
| Package manager | pnpm, pinned with the `packageManager` field | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Node.js | Version 22 LTS | `.nvmrc`, `engines` in `package.json` |
| Types | TypeScript in strict mode, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` | `tsconfig.base.json`, one `tsconfig.json` per workspace |
| Lint | ESLint flat config with typescript-eslint strict rules. The web app adds the Next.js and React Hooks rules | `eslint.config.mjs`, `apps/web/eslint.config.mjs` |
| Format | Prettier. Markdown is formatted by hand and ignored | `.prettierrc.json`, `.prettierignore` |
| Tests | Vitest, run once from the root across all packages | `vitest.config.ts` |
| Styling | Tailwind CSS 4, themed from the design tokens | `apps/web/src/app/globals.css` |
| CI | GitHub Actions: repository hygiene, then format, lint, typecheck, test and build | `.github/workflows/ci.yml` |

## Configuration

The app runs with no environment variables. Every public setting has a default, and optional provider keys are read only when a provider needs them. Variable names are listed in [`.env.example`](../.env.example), and what each one does is in [DEPLOYING.md](DEPLOYING.md).
