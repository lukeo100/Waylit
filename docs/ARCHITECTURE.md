# Architecture

Waylit is a pnpm workspace monorepo. The web app is one consumer of a set of small shared packages. A later Expo app will be a second consumer of the same packages, so anything that is not specific to the browser lives outside `apps/web`.

This page describes what exists today. The map provider package is still only an interface, and the rest fills in as the milestone 1 tasks land (see [AGENT_BRIEF.md](AGENT_BRIEF.md)).

## Layout

```
apps/
  web/                 Next.js App Router app (the PWA). Rendering, pages, browser APIs.
packages/
  core/                Navigation types, units, geo helpers, route progress, simulated GPS, GPS distance, smoothing, HUD number formatting, media model and mock tracks, and the solar module (sun position, day phase, sun times). No DOM, no React.
  vehicle/             Read-only vehicle interface, mock Ninebot MAX G3 adapter, energy model, speed fallback and trip distance fallback with GPS backfill. No DOM, no React.
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
  src/app/ride/              The riding screen: full screen, no chrome, wake lock while a trip runs
  src/pwa/                   Plain TypeScript logic: wake lock, install, update flow, safety notice, orientation
  src/components/            Thin React wrappers: install button, safety notice, rotate prompt, worker registrar
```

Logic sits in `src/pwa` as framework free modules that take their browser objects as arguments, so Vitest can test them with fakes. The components only wire those modules to React. The ride screen calls `useWakeLock` while a trip is running. Nothing here moves into `packages/*`, because it all needs the browser.

## Riding screen

The riding screen (`apps/web/src/app/ride/page.tsx`) is a floating HUD over a scene that fills the whole screen. The middle is kept clear for the 3D scene (task 8). It runs on the simulation layer and makes no network calls. It keeps `useWakeLock` (while a trip is running) and the `RotateOverlay` from the route layout.

```
apps/web/src/
  ride/
    ride-session.ts     One simulated ride, no timers and no DOM. Wires GpsSimulator, the mock vehicle
                        adapter, selectSpeed, GpsDistanceIntegrator, TripTracker and route progress
                        into one snapshot per tick. Phases: idle, riding, summary.
    ride-store.ts       useSyncExternalStore adapter. Runs the session on a 250 ms timer only while subscribed.
    use-ride.ts         React hook over the store
    guard.ts            Speed guard thresholds and the hold times
  hud/
    NavigationPanel     top left, no card: vehicle speed as a huge bare number, GPS speed and unit under it,
                        next turn arrow, distance, street instruction, time and distance left, arrival
    StatusCluster       top right: local time, mock temperature, connectivity dot (plain text, no panel)
    Minimap             top right: round plain SVG route line, position dot, heading cone, N. No tiles
    Dock                one joined glass dock with a hairline divider between its two halves
    MediaPanel          dock, left half: artwork, title, artist, previous, play or pause, next, progress line
    VehiclePanel        dock, right half: battery, range, trip distance and time, End trip
    SceneSlot           the gradient scene placeholder and the reserved credits strip
    HoldButton          hold to press control with ring or fill feedback and a static held state
    DevControls         dev only: playback speed, lose scooter data, and a Time row that overrides the date and time
    daylight.ts         pure: daylight state from position and time, time override presets and local time helpers
    daylight-context    DaylightProvider and the useDaylight() hook
    StartPrompt, TripSummary, icons, and pure helpers (hold, minimap geometry, telemetry note,
                        time formatting, dev option parsing)
  media/                Media Session binding, tone engine and useMockMedia (see Mock media above)
```

How it fits together:

- **Screen grid.** The scene is `absolute inset-0` and the HUD sits on it in one CSS grid with three rows: the top area (speed, turn, status and minimap, and the free centre), the dock, and the credits strip. The credits strip is its own row, a darker band, so no panel can overlap it. The dock is inset from the screen edges and is the only thing along the bottom. In the centre column only the start prompt, the trip summary and the dev controls are ever drawn.
- **Day and night.** The page works out a `DaylightState` (`hud/daylight.ts`) from the sun at the rider's position and the current time: the sun's elevation, azimuth and phase from `getSolarState` in `@waylit/core`, a smooth `factor` from 0 (dark) to 1 (day) from `daylightFactor` (a smoothstep from -6 to +6 degrees of sun elevation), and a `warmth` value that peaks at sunrise and sunset. The position is the simulated GPS fix while riding and the start of the demo route otherwise (real GPS later). The time is the device clock, to the minute, or the dev override. The page puts `--wl-daylight` and `--wl-warmth` on the screen root, plus `data-daylight` (true when the factor is one half or more) and `data-sun-phase`. CSS blends the dock fill between `glassNight` and `glassDay` with `color-mix`, so it fades through dawn and dusk instead of switching at a fixed hour, and tints the placeholder scene. The old fixed 07:00 to 19:00 rule is gone. Before the page has loaded there is no time and the state is night, so the server render and the first client render match.
- **Daylight for the 3D scene.** `DaylightProvider` makes the same `DaylightState` available to everything on the screen, and `useDaylight()` reads it. Task 8 (3D lighting) should read the sun's `elevationDegrees`, `azimuthDegrees` and `phase`, the `factor` and the `warmth` from it, and must not work out its own time of day. `overridden` says when a dev time override is in force.
- **Data flow.** `RideSession.tick()` advances the GPS simulator, ticks the mock vehicle, projects the smoothed GPS fix onto the route (`projectOntoRoute`) to get the distance along it, and turns that into the next instruction, distance to it, remaining distance and time and arrival (`computeProgress`). Speed comes from `selectSpeed`. Trip distance and duration come from `TripTracker`. The HUD only reads the snapshot.
- **GPS fallback.** Scooter speed is used while telemetry is fresh. When it is missing or older than two seconds, the headline speed uses GPS and says so (an amber `GPS 17` and a note under the speed), battery and range show dashes, and trip distance and duration carry on from GPS distance (`GpsDistanceIntegrator`) and the ride clock. `TripTracker` adds up changes instead of swapping totals, so the figure never jumps and never goes backwards. A frozen sample counts as fresh for two seconds and adds nothing, so the tracker remembers the GPS distance and ride time at the last new vehicle sample and backfills everything GPS saw since then the moment telemetry goes stale (and again on the first sample after a dropout). Nothing is lost in the stale window. The reading also records whether GPS was used at any point, so the trip summary can say GPS, a mix of the scooter and GPS, or nothing.
- **Minimap.** A round map drawn from the route's own coordinates only. While riding it follows the rider with the heading up and shows a heading cone. Before and after a trip it shows the whole route inside the circle, north up. It uses no map tiles and no map data, so it needs no map credit and can sit next to Google tiles later (see Amendment 3 in the brief).
- **Speed guard.** Above 8 km/h (off again below 5) the media controls and End trip need a deliberate press: a touch or mouse press must be held for 0.6 s (0.9 s for End trip). Each guarded control shows its feedback without relying on animation: a ring (media buttons) or a fill (End trip) that grows while held, plus a static held state and a caption ("Keep holding"). With reduced motion the ring and fill show complete at once. Keyboard and assistive technology activation goes straight through.
- **End trip.** Takes the summary (distance, duration, average speed), stops the simulator, releases the wake lock (the hook is only enabled while riding) and stops the media: `useMockMedia(false)` pauses and rewinds the player, silences the tone engine and clears the Media Session metadata and handlers. **Start new trip** builds a fresh session and returns to the start state.
- **Dev controls.** Playback speed (1x, 2x, 4x, 8x), a "Lose scooter data" switch and a Time button that opens the time override. Shown in development builds. In a production build they appear only when the address has `?dev=1`, and the credits strip shows a faint placeholder label only then too, so riders never see it. At fast playback the HUD shows ride time, so arrival and time left are what the simulated rider would see at normal speed. All dev buttons are at least 44 px.
- **Time override.** For success criterion 5 (day, sunset and night demonstrable). The Time row has Live (follow the real clock), Dawn, Noon, Sunset and Night presets, a time of day slider, a date field and a readout of the time, phase and sun elevation. The presets are worked out from the sun times at the rider's place on the chosen date: dawn is five minutes after sunrise, noon is solar noon, sunset is five minutes before sunset and night is solar midnight. They work for any device time zone, because the demo route is in Berlin and the device may be anywhere. The slider and date field use the device's own zone, like the HUD clock. While an override is on, the clock, the arrival time, the dock fill and the scene tint all follow it, and the time is frozen. Closing the Time row goes back to live. An address such as `?dev=1&time=sunset`, or `?dev=1&time=2026-06-21T20:30:00Z` (a date and time with an offset), opens straight at that moment. The override exists only while the dev controls are shown.
- **First render.** The server render and the first client render use a fixed empty snapshot and the clock shows `--:--` until mounted, so there is no hydration mismatch.

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

### Sun and daylight (`packages/core`)

- `solar.ts` implements the NOAA solar position algorithm, a public domain procedure from the US National Oceanic and Atmospheric Administration based on Jean Meeus, "Astronomical Algorithms". The code is original and written from the published equations (see [THIRD_PARTY.md](THIRD_PARTY.md)). It has no dependencies, no DOM and no network, and it reads only `Date.getTime()`, so the answer does not depend on the machine's time zone.
- `getSolarState(lat, lng, date)` returns the sun's elevation (without and with atmospheric refraction), its azimuth as a compass bearing, whether it is rising, and a phase: `day` (6 degrees or higher), `golden-hour` (from the sunrise elevation of -0.833 up to 6), `civil-twilight` (down to -6), `nautical-twilight` (down to -12) and `night`. The golden hour limit is a photographers' convention, not an astronomical one.
- `getSunTimes(lat, lng, date)` returns solar noon, sunrise, sunset, civil dawn and dusk and nautical dawn and dusk for the solar day around the instant (the 24 hours centred on local mean solar noon, so a rider far east of Greenwich gets their own local day). Times are `Date` objects and can fall on a neighbouring UTC date. In polar day and polar night sunrise and sunset are `null` and `polar` says which. Where the sun sets but never gets 6 degrees down (a white night) only the twilight fields are `null`.
- `daylightFactor(elevation)` is the smooth 0 to 1 factor the HUD uses.
- Tests compare against reference values for London and Sydney at both solstices, Berlin, the equator at the March equinox, Quito, Reykjavik (a white night) and Tromso (polar night and midnight sun), with a tolerance of 2 minutes for times and 0.5 degrees for angles. The largest difference measured against the reference values is about 5 seconds. The reference values and where they came from are in `solar.test.ts`.

### Vehicle telemetry (`packages/vehicle`)

- `createMockVehicleAdapter` implements the read-only `VehicleAdapter` interface. It imitates a Segway Ninebot MAX G3: battery percent, estimated range, trip distance, trip duration, odometer and a vehicle speed that is separate from GPS speed. The reference figures and their sources are in `spec.ts`.
- The default speed limit is 25 km/h. It is a setting, not a property of the vehicle, and the mock never reports more than the limit.
- The energy model in `energy.ts` is fitted through the maker's two claimed range points (80 km at 15 km/h and 65 km at 25 km/h), then scaled by a real-world factor of 1.5 and a small constant draw. It is a plausible mock, not a physical model.
- `selectSpeed` is the fallback selector. Vehicle speed is used when it is present and fresh. If telemetry is missing, has no speed, is invalid or is older than two seconds, GPS speed is used instead and the result says why. GPS speed is ignored too once it is older than five seconds. The result also says which source it used.
- The adapter has no method that sends anything to a vehicle and uses no Bluetooth. Its `tick()`, `startTrip()` and `setOmittedFields()` controls exist only on the mock type, to drive tests and demos.

### Mock media

- `packages/core` holds the media model: `MediaTrack`, `MediaPlayer` (play, pause, toggle, next, previous, seek and progress, driven by the injected clock) and five invented tracks in `mock-media.ts`. Cover art is generated as SVG by `artwork.ts`. Nothing is a recording, and no real artist or service is involved.
- `apps/web/src/media` is the browser side. `mediaSession.ts` mirrors the player to the Media Session API (metadata, artwork, position and the play, pause, next track and previous track handlers). `toneEngine.ts` synthesises each track with Web Audio and routes it through a media element so browsers treat the page as playing media. `useMockMedia.ts` ties them together for the HUD to use, and `useMockMedia(false)` stops everything. None of it draws any UI. `mediaSession.ts` also offers PNG copies of the artwork (`artwork-png.ts`) next to the SVG, because media notifications are not guaranteed to draw SVG, and handles the `seekto` action.

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
