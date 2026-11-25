# Architecture

Waylit is a pnpm workspace monorepo. The web app is one consumer of a set of small shared packages. A later Expo app will be a second consumer of the same packages, so anything that is not specific to the browser lives outside `apps/web`.

This page describes what exists today. The 3D scene runs on a map provider interface with two implementations, and the rest fills in as the milestone 1 tasks land (see [AGENT_BRIEF.md](AGENT_BRIEF.md)).

## Layout

```
apps/
  web/                 Next.js App Router app (the PWA). Rendering, pages, browser APIs.
packages/
  core/                Navigation types, units, geo helpers, route progress, simulated GPS, GPS distance, smoothing, HUD number formatting, media model and mock tracks, and the solar module (sun position, day phase, sun times). No DOM, no React.
  vehicle/             Read-only vehicle interface, mock Ninebot MAX G3 adapter, energy model, speed fallback and trip distance fallback with GPS backfill. No DOM, no React.
  map-provider/        The map provider interface, provider selection, follow camera maths, lighting parameters, performance options and frame statistics. No DOM, no React, no provider SDKs.
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
  src/app/ride/              The riding screen: fullscreen, no chrome, wake lock while a trip runs
  src/pwa/                   Plain TypeScript logic: wake lock, fullscreen, install, update flow, safety notice, orientation
  src/components/            Thin React wrappers: install button, safety notice, rotate prompt, worker registrar
```

Logic sits in `src/pwa` as framework free modules that take their browser objects as arguments, so Vitest can test them with fakes. The components only wire those modules to React. The ride screen calls `useWakeLock` while a trip is running, asks for fullscreen from the Start trip tap (`enterFullscreen`) and leaves it when the trip ends (`exitFullscreen`). Nothing here moves into `packages/*`, because it all needs the browser.

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
    Dock                one joined glass dock, content sized and centred, with a hairline divider between its two halves
    MediaPanel          dock, left half: artwork, title, artist, previous, play or pause, next, progress line
    VehiclePanel        dock, right half: battery, range, trip distance and time, End trip
    SceneSlot           the gradient scene placeholder and the reserved credits strip
    HoldButton          hold to press control with ring or fill feedback and a static held state
    DevControls         dev only: playback speed, lose scooter data, and a Time page that overrides the date and time
    daylight.ts         pure: daylight state from position and time, time override presets and local time helpers
    daylight-context    DaylightProvider and the useDaylight() hook
    StartPrompt, TripSummary, icons, and pure helpers (hold, minimap geometry, telemetry note,
                        time formatting, dev option parsing)
  media/                Media Session binding, tone engine and useMockMedia (see Mock media above)
```

How it fits together:

- **Screen grid.** The scene is `absolute inset-0` and the HUD sits on it in one CSS grid with three rows: the top area (speed, turn, status and minimap, and the free centre), the dock, and the credits strip. The credits strip is its own row, a darker band, so no panel can overlap it. The dock row is a flex container that centres the dock, which is sized to its content and capped at 80 percent of the screen width (or 42rem on small phones, where its content needs the room), so it floats with a margin on both sides. It is the only thing along the bottom. The track title block has a fixed fluid width, so the dock does not change width from track to track. The credits strip stays full width. In the centre column only the start prompt, the trip summary and the dev controls are ever drawn.
- **Day and night.** The page works out a `DaylightState` (`hud/daylight.ts`) from the sun at the rider's position and the current time: the sun's elevation, azimuth and phase from `getSolarState` in `@waylit/core`, a smooth `factor` from 0 (dark) to 1 (day) from `daylightFactor` (a smoothstep from -6 to +6 degrees of sun elevation), and a `warmth` value that peaks at sunrise and sunset. The position is the simulated GPS fix while riding and the start of the demo route otherwise (real GPS later). The sun moment is chosen by `sunMoment` in `@waylit/core` (see "Which moment the sun is worked out for" below): the device clock reading applied at the route as local solar time by default, the real instant with the "real sun" switch, and the dev override over both. The page puts `--wl-daylight` and `--wl-warmth` on the screen root, plus `data-daylight` (true when the factor is one half or more) and `data-sun-phase`. CSS blends the dock fill between `glassNight` and `glassDay` with `color-mix`, so it fades through dawn and dusk instead of switching at a fixed hour, and tints the placeholder scene. The old fixed 07:00 to 19:00 rule is gone. Before the page has loaded there is no time and the state is night, so the server render and the first client render match.
- **Daylight for the 3D scene.** `DaylightProvider` makes the same `DaylightState` available to everything on the screen, and `useDaylight()` reads it. Task 8 (3D lighting) should read the sun's `elevationDegrees`, `azimuthDegrees` and `phase`, the `factor` and the `warmth` from it, and must not work out its own time of day. `overridden` says when a dev time override is in force.
- **Data flow.** `RideSession.tick()` advances the GPS simulator, ticks the mock vehicle, projects the smoothed GPS fix onto the route (`projectOntoRoute`) to get the distance along it, and turns that into the next instruction, distance to it, remaining distance and time and arrival (`computeProgress`). Speed comes from `selectSpeed`. Trip distance and duration come from `TripTracker`. The HUD only reads the snapshot.
- **GPS fallback.** Scooter speed is used while telemetry is fresh. When it is missing or older than two seconds, the headline speed uses GPS and says so (an amber `GPS 17` and an amber note with a small icon under the speed), battery and range show dashes, and trip distance and duration carry on from GPS distance (`GpsDistanceIntegrator`) and the ride clock. `TripTracker` adds up changes instead of swapping totals, so the figure never jumps and never goes backwards. A frozen sample counts as fresh for two seconds and adds nothing, so the tracker remembers the GPS distance and ride time at the last new vehicle sample and backfills everything GPS saw since then the moment telemetry goes stale (and again on the first sample after a dropout). Nothing is lost in the stale window. The reading also records whether GPS was used at any point, so the trip summary can say GPS, a mix of the scooter and GPS, or nothing. The first 50 m counted before the scooter's first sample are the normal start of a trip (the link takes a moment) and do not count as GPS use.
- **Minimap.** A round map drawn from the route's own coordinates only. While riding it follows the rider with the heading up and shows a heading cone. Before and after a trip it shows the whole route inside the circle, north up. It uses no map tiles and no map data, so it needs no map credit and can sit next to Google tiles later (see Amendment 3 in the brief).
- **Speed guard.** Above 8 km/h (off again below 5) the media controls and End trip need a deliberate press: a touch or mouse press must be held for 0.6 s (0.9 s for End trip). Each guarded control shows its feedback without relying on animation: a ring (media buttons) or a fill (End trip) that grows while held, plus a static held state and a caption ("Keep holding"). With reduced motion the ring and fill show complete at once. Keyboard and assistive technology activation goes straight through.
- **End trip.** Takes the summary (distance, duration, average speed), stops the simulator, releases the wake lock (the hook is only enabled while riding) and stops the media: `useMockMedia(false)` pauses and rewinds the player, silences the tone engine and clears the Media Session metadata and handlers. **Start new trip** builds a fresh session and returns to the start state.
- **Dev controls.** Playback speed (1x, 2x, 4x, 8x), a "Lose scooter data" switch and a Time button that switches the panel to the time override page. The panel is always one row tall, so it never covers the navigation text under the Start trip button on short screens. Shown in development builds. In a production build they appear only when the address has `?dev=1`, and the credits strip shows a faint placeholder label only then too, so riders never see it. At fast playback the HUD shows ride time, so arrival and time left are what the simulated rider would see at normal speed. All dev buttons are at least 44 px.
- **Time override.** For success criterion 5 (day, sunset and night demonstrable). The Time page has Back, Live (follow the real clock), Dawn, Noon, Sunset and Night presets, a time of day slider, a date field and a readout of the time, phase and sun elevation. The presets are worked out from the sun times at the rider's place on the chosen date: dawn is five minutes after sunrise, noon is solar noon, sunset is five minutes before sunset and night is solar midnight. They work for any device time zone, because the demo route is in Berlin and the device may be anywhere. The slider and date field use the device's own zone, like the HUD clock. While an override is on, the clock, the arrival time, the dock fill and the scene tint all follow it, and the time is frozen. Back returns to the simulation page and keeps the override (the Time button stays filled), and only Live goes back to the real clock. An address such as `?dev=1&time=sunset`, or `?dev=1&time=2026-06-21T20:30:00Z` (a date and time with an offset), opens straight at that moment. The override exists only while the dev controls are shown.
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
- **Providers stay behind the interface.** `map-provider` defines what the app needs from any map or 3D tile provider. Provider SDK types (CesiumJS, MapLibre or others) belong in a provider implementation, never in shared types. The two implementations live in `apps/web/src/map` and are described under "3D scene" below.
- **Vehicles stay behind the interface.** `vehicle` exposes telemetry and connection state only. It has no methods that send commands to a vehicle, and must not gain any without a maintainer agreement in an issue. Every telemetry field is optional, and the app falls back to GPS-derived values when one is missing. GPS speed and vehicle speed are separate values.
- **Tokens are the single source of visual values.** `ui-tokens/src/tokens.ts` is the source of truth. `tokens.css` mirrors it as CSS custom properties for the web, and a test fails if the two drift. The web app maps the variables into its Tailwind theme. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## 3D scene

The riding screen draws a 3D environment behind the HUD. Navigation logic is separate from rendering: the simulated GPS in `@waylit/core` produces positions, and the scene only receives a camera pose and a lighting description.

```
packages/map-provider/src/
  types.ts          MapProvider interface, CameraPose, SceneLighting, status and diagnostics types
  options.ts        Provider selection, performance tuning and the address overrides
  follow-camera.ts  Third person follow camera: smoothing, heading, velocity extrapolation
  lighting.ts       Day, golden hour and night parameters from the solar state
  frame-stats.ts    Frame time statistics and the frame limiter
  ground-height.ts  A constant ground height supplied by the route, never read from tiles
apps/web/src/map/
  MapScene.tsx           React host: creates the controller, shows the amber note and the dev overlay
  scene-controller.ts    Feeds the provider from the GPS stream, handles pause and one time fallback
  load-provider.ts       Lazy loads a provider (each is its own chunk, not in the start screen JS)
  cesium-google.ts       CesiumJS with Google Photorealistic 3D Tiles through Cesium ion
  maplibre-fallback.ts   MapLibre GL JS with OpenFreeMap vector tiles and open terrain
  camera-math.ts         Maps the follow pose onto each renderer's camera model
  lighting-input.ts      Turns the HUD daylight state into scene lighting
  credits-dom.ts, errors.ts, base-provider.ts, fallback-style.ts, cesium-setup.ts, MapStats.tsx
```

### Choosing a provider

`selectProvider` in `options.ts` picks one provider per page load:

| Situation | Provider |
|---|---|
| `?map=fallback` | MapLibre fallback |
| `?map=cesium` and a Cesium ion token is configured | CesiumJS |
| `?map=cesium` and no token | MapLibre fallback |
| No token | MapLibre fallback |
| Token configured, development build, no override | MapLibre fallback (saves the monthly allowance) |
| Token configured, production build | CesiumJS |

The app builds and runs without a token. Only one attempt is made with CesiumJS. If it fails (rejected token, no network, quota, no WebGL), the scene controller swaps to the MapLibre fallback once and shows a quiet amber note. It never retries in a loop.

### Follow camera

`FollowCamera` receives each GPS fix and produces a camera pose at display rate: a position behind and above the rider, looking at a point ahead of the rider, so the rider sits in the lower middle of the screen and the horizon in the upper third. Position and heading are smoothed exponentially, with a short velocity extrapolation between fixes. Each provider turns the pose into its own camera. CesiumJS takes a heading, pitch and range around the target. MapLibre takes a centre, zoom, pitch and bearing. There is no rider model or route corridor yet.

### Lighting

The scene follows the solar daylight state that already drives the HUD, including the developer time override. `lightingParameters` returns sun direction, light intensity, a tint for the photographic tiles, sky colours and a map palette for the fallback. Photorealistic tiles carry baked daylight, so night and sunset can be produced by tinting them with an unlit custom shader rather than by relighting them. That tile shader (the night tint and the warm street light lift) recolours the tile imagery, so it is created only when the visual effect is on (`?fx=low` or `?fx=high`, or `GOOGLE_FX_ON_BY_DEFAULT`). With the effect off, which is the default in Google mode, no custom shader or post process is applied to the tiles and they are drawn as Google supplies them; only the sky atmosphere and the scene background follow the daylight state. Parameters carry a quantised `key` so providers skip repaints for tiny changes.

### Performance

Aimed at a mid range Android phone. Both providers load lazily. The device pixel ratio is capped (1.5 for CesiumJS, 2 for MapLibre). CesiumJS uses a high screen space error (32), a 256 MiB tile cache and no globe, base imagery, skybox, sun, moon or widgets. Frames are capped at 30 fps while riding and 10 fps before the trip starts. Rendering pauses when the tab is hidden and when the ride has ended. A development only overlay (dev builds or `?dev=1`) shows current fps, the 1 percent low, the median over the last 60 seconds, the median over the last 5 minutes and the median over the whole ride with the ride time (success criterion 9 is a median over 5 minutes of riding), tile counts and the effect level. It is drawn in the right hand column under the minimap, with the amber map note, so it never sits on the speed or turn text. The whole ride median comes from a histogram of frame times, so a long ride costs no memory. Tuning can be overridden for testing with `?dpr=`, `?fps=`, `?sse=` and `?terrain=`.

### Quota and ground rules for Google tiles

CesiumJS loads Google Photorealistic 3D Tiles through Cesium ion (asset 2275207). There is no Google key and no Google billing account in the app. The app never reads heights from Google tiles: it does not sample heights, pick heights from the scene or query terrain against the tiles. The camera and rider height come from a constant ground height for the route (`?ground=` overrides it for testing): about 45 m above sea level (the flat Tempelhof field) plus a geoid undulation of about 40 m at Berlin (39.5 to 40 m), so 85 m above the WGS84 ellipsoid. It is a documented estimate chosen from general knowledge and the task 8 review (first 95 m, then 90 m, now 85 m), never measured or derived from the tiles. It could not be looked up against EGM2008 in the build sandbox (network blocked), so treat it as good to about 5 m, which only changes how high the camera looks. It is a constant by design and never derived from the tiles. Every Cesium page load can use one of the monthly root tileset requests of the ion free allowance, which is why development builds default to the fallback.

### Visual effects and the Google terms

The 3D view has a futuristic look, a screen space post process on the CesiumJS path and a style colour grade on the MapLibre fallback.

```
packages/map-provider/src/fx.ts   FxLevel, fxParameters (from the daylight state), gradePalette, FxGovernor, ?fx parsing
apps/web/src/map/fx-shader.ts     the GLSL (original, commented) and the uniform packing
apps/web/src/map/fx-stage.ts      the Cesium PostProcessStage wrapper (one stage, variants, suspend)
apps/web/src/app/dev/fx-preview/  dev page: a procedural scene through the real stage (needs ?dev=1)
```

- **One pass, colour only.** The shader reads only `colorTexture`. There is no depth texture, no `scene.pick`, no picking, no depth based fog or edge detection, and no geometry, so nothing about the height or shape of the Google tiles is read or recorded. A unit test fails if the shader source mentions depth, picking or `czm_` inputs, has a loop or a branch, or reads more textures than its variant allows (3 in the cheap variant, 9 in the full one).
- **The look.** A colour grade (slight desaturation, controlled contrast, deep navy darks, cool lights), a cyan Sobel edge glow on the picture's luminance (strongest at night, where the tint makes edges faint and the gain is raised), a horizon haze band and a vignette from screen coordinates, and in the full variant a very faint scanline. Day is cooler and cleaner, sunset has a warm magenta to cyan split tone, night is deep blue with glowing cyan edges. The palette stays dark and quiet with cyan as the only accent.
- **Parameters come from the daylight state.** `fxParameters(lighting, level)` maps the daylight factor and the warmth to every strength (tested). Levels are `high` (full Sobel, scanline), `low` (two neighbour reads, no scanline) and `off` (the stage is removed).
- **Adaptive.** `FxGovernor` records frame times through the same `FrameStats` as the overlay and steps down from high to low to off when the median frame rate since the last change is below 30 fps (with the frame limiter's 2 ms tolerance, so a steady 30 fps is not slow), after at least 90 frames and 4 seconds at the level. It only judges while riding (the start screen is slow on purpose), never steps back up, and is switched off by an explicit `?fx=`. The effect is suspended while the tab is hidden or the ride has ended.
- **Overrides.** `?fx=off`, `?fx=low` and `?fx=high` work in every build and pin the level. The level shows in the dev overlay.
- **MapLibre fallback.** `gradePalette` grades the style colours the same way (navy and teal pull, less saturation, roads and building edges lifted toward cyan at night). It is a colour change only and costs nothing per frame.
- **Google terms and the default.** The brief says to check whether altering the look of the tiles is restricted before shipping this in Google mode. It could not be checked here: WebFetch was refused and the Google pages are blocked by the sandbox network. What is known comes from the mapping spike report (read 2026-11-22): the Map Tiles Policies page does not mention restyling or colour grading, and Terms 3.2.3(c) forbids creating content based on Google Maps Content, which could be read to reach a restyled copy of the imagery, although the effect makes no copy and only changes colours on screen. The night tint and street light lift of the tiles (the tile shader) follow the same setting, so with the effect off nothing recolours the Google tiles. It is not clearly allowed and not clearly forbidden, so it ships **off by default for Google tiles**: `GOOGLE_FX_ON_BY_DEFAULT = false` in `fx.ts` is the constant, and `?fx=low` or `?fx=high` turns it on for a test. It is the maintainer's accepted risk to switch it on after reading Policies and Terms 3.2.3. `?fx=off` always switches it off. The fallback map, which is not Google content, runs the grade by default. The effect never touches the Google logo or the credits, which are DOM elements outside the canvas.

### Static assets and caching

CesiumJS needs its workers and assets served as files. `apps/web/scripts/copy-map-assets.mjs` copies them from `@cesium/engine` into `apps/web/public/cesium` and the MapLibre worker into `apps/web/public/maplibre` before `dev` and `build`. Those folders are ignored by git. The app sets `CESIUM_BASE_URL` to `/cesium/`. The service worker bypasses `/cesium/`, `/maplibre/` and every cross origin request, so Google, Cesium ion, OpenFreeMap and Mapterhorn tiles are never cached by Waylit. No content security policy is shipped by the app. If you add one, allow the hosts listed in [DEPLOYING.md](DEPLOYING.md).

### Credits

The scene renders its own attributions into the credits strip under the dock, which the HUD never covers. CesiumJS shows the Google logo, the data credits Google requires and the Cesium ion logo. The fallback shows OpenFreeMap, OpenMapTiles and "© OpenStreetMap contributors", plus a Mapterhorn credit when terrain is on. The minimap is a plain drawn route and never contains OpenStreetMap content.

Nothing may cover the strip, including the first run safety notice. The notice is fixed to the bottom of the page outside the riding screen's layout, so the riding screen publishes the strip's height as `--wl-credits-clearance` on the document root (`useCreditsClearance`) and the notice sits above it and caps its height with it. The 3D scene also does not start until the notice is acknowledged, so no tile credits are on screen behind an open notice. `apps/web/scripts/layout-check.mjs` (a dependency free headless Chrome script, run against a running build) probes the strip at 915x412, 740x360, 667x375, 800x360 and 1280x720 with the notice open and closed, with and without `?dev=1`, and fails if anything covers it or if any HUD parts overlap. With `FAKE_CREDITS=1` it also draws Cesium style credits, adds a 640 pixel wide run, and checks they stay on one line with both logos visible.

Google asks for its credits on one line. The credit text is kept to one line, and when it does not fit it moves behind Cesium's "Data attribution" link (`tileset.showCreditsOnScreen` is turned off by `watchCreditsFit`, with hysteresis so it does not flicker, and turned on again when the strip is clearly wider). The Google and Cesium ion logos are never part of that and always stay. This was checked with a stand in for Cesium's credit markup, not with live Google credits (the tile hosts are blocked in the build sandbox), so the owner should look at it on the phone.

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

### Which moment the sun is worked out for (`packages/core`, `sun-moment.ts`)

The demo route is always in Berlin, but the person testing it can be anywhere. The first device test was at 22:04 in Australia: the real Berlin sun was high at noon, so the scene was a bright blue day under a 22:04 HUD clock. So while the position is simulated the default is **"Light follows my clock"**.

- `sunMoment({ mode, positionSource, deviceNowMs, deviceUtcOffsetMinutes, position })` returns the instant to put into `getSolarState`. With `mode: "follow-clock"` it is the instant at which the apparent (sundial) solar time at the route equals the device's wall clock time of day on the device's date (`followClockInstant`): take the wall clock reading as if UTC, subtract `longitude * 4` minutes, then move by the equation of time (real solar noon that day against 12:00 mean solar time) so that 12:00 is exactly solar noon and 00:00 solar midnight. With `mode: "real-sun"` it is the real instant, so the scene shows what Berlin is really doing.
- The HUD clock always shows the device's own time. `DaylightState.nowMs` is the sun moment (the 3D scene's sky and sun use it) and `clockMs` is the device clock reading the HUD shows.
- The dev time override (dawn, noon, sunset, night, or a given instant) is a real instant at the route and always wins over both modes.
- **Real GPS later is a one line change.** `hud/sun-mode.ts` has `POSITION_SOURCE = "simulated"`. Set it to `"gps"` and `sunMoment` ignores the mode and uses the real position with the real time, with no mapping.
- Switching: the start screen has a button "Light follows my clock" or "Real sun at the route" (remembered in localStorage as `waylit:sun-mode:v1`), and `?sun=clock` or `?sun=real` in the address overrides it.
- Edge cases. Time zones: only the wall clock reading and the longitude are used, so the same reading in Melbourne, Berlin or New York gives the same scene (tested). Date line: the result is an ordinary UTC instant that can fall on the neighbouring UTC day, but the local solar date at the place is always the device's date, so no day is skipped or repeated (tested at longitudes from -179.9 to 179.9). Polar day and night: the sun is worked out honestly, so inside the polar circle in midwinter every clock time is dark and in midsummer every clock time is bright, as in real life (tested at Tromso). Daylight saving: the offset is read at the device's own instant, so the reading is what the person sees. Seasons still show, because the device's date is kept.
- Night in the Cesium scene: the sky atmosphere is always dimmed by the daylight factor (it is not Google content). When the visual effect is on, the tile tint multiplies the photographic daylight down to deep blue and a faint warm lift on the brightest surfaces (pale roads and walls) gives a street light feel. Both are one custom shader (`apps/web/src/map/tile-shader.ts`) that uses the tile's own colour and nothing about its shape, and it is created only when the effect is on (a unit test checks that it is not created when the level is off). In Google mode with the effect off, which is the default, nothing recolours the tiles at any time of day, so night tiles keep Google's baked daylight. The MapLibre fallback uses its night palette and sky from the same state.

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
