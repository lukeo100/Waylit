# Design system

Waylit should feel like a quiet cockpit at night: near black, flat translucent panels with hairline borders, one soft cyan accent, and amber and red only when something needs attention. The 3D scene fills the whole screen and the HUD floats on it. Everything else stays quiet so the 3D view leads.

The tokens live in [`packages/ui-tokens`](../packages/ui-tokens). `src/tokens.ts` is the source of truth and works on any platform. `src/tokens.css` exposes the same values as CSS custom properties prefixed `--wl-`, and a test fails if the two files drift apart. The web app maps the variables into Tailwind in `apps/web/src/app/globals.css`.

## Principles

1. **The world leads, the HUD supports.** The scene is the whole screen and nothing darkens it: no scrim, no gradient across the screen, no vignette. The HUD is a few small pieces of dark glass, each only as big as what it holds, at the corners and along the bottom. If something competes with the road, make it smaller or quieter.
2. **Glanceable first.** The vehicle speed is the biggest number on the screen, set with tight letter spacing. Distance to the next turn is next. Secondary text is smaller and in muted grey.
3. **One accent.** Soft cyan (`cyan`, `#5fc8e8`) is the only non-warning accent: the route on the minimap, progress, active states and the heading. It is never used as decoration.
4. **Colour has a job.** Amber and red are allowed for warnings and errors (Amendment 6). Amber (`caution`, a muted amber that suits the dark theme) is for warnings: the telemetry lost note, the GPS fallback label, offline, low battery and safety notices. Red is for errors and for End trip, as a dark red fill, a muted red outline and soft red text. Green is only the small online dot. Never use amber or red as decoration.
5. **No glow, no heavy blur on the HUD.** HUD panels are flat, about 85 percent opaque, with a hairline border and no backdrop blur, so they stay cheap on a mid-range phone. Glow tokens are kept for the 3D scene's route and heading marker, and for the keyboard focus ring.
6. **Large targets.** Anything touchable is at least 44 by 44 pixels (`touch.min`).
7. **Respect reduced motion.** Ambient animation stops under `prefers-reduced-motion`. Motion that answers a rider's action may stay but should be short, and feedback must never depend on it.
8. **Original identity.** No vehicle maker, car maker or map provider branding, colours or logos.

## Colour

| Token | CSS variable | Tailwind | Value | Use |
|---|---|---|---|---|
| `night950` | `--wl-color-night-950` | `night-950` | `#05070b` | App and scene background |
| `night900` | `--wl-color-night-900` | `night-900` | `#0a0d12` | Raised background |
| `night800` | `--wl-color-night-800` | `night-800` | `#12161c` | Solid panels, inputs |
| `night700` | `--wl-color-night-700` | `night-700` | `#1d222a` | Dividers, tracks, scene horizon |
| `cyan` | `--wl-color-cyan` | `cyan` | `#5fc8e8` | The one accent: route, progress, active states, heading |
| `cyanSoft` | `--wl-color-cyan-soft` | `cyan-soft` | `#a5dff0` | Hover on accent buttons |
| `text` | `--wl-color-text` | `text` | `#eef1f4` | Primary text and the speed number |
| `textSecondary` | `--wl-color-text-secondary` | `text-secondary` | `#d3d9e0` | Labels, street instruction |
| `textMuted` | `--wl-color-text-muted` | `text-muted` | `#b0b8c3` | Time and distance left, hints |
| `caution` | `--wl-color-caution` | `caution` | `#e6b04f` | The warning amber: telemetry lost note, GPS fallback label, offline, low battery, safety notices |
| `danger` | `--wl-color-danger` | `danger` | `#f0868f` | Errors, and End trip text |
| `dangerBorder` | `--wl-color-danger-border` | `danger-border` | `rgba(200, 84, 96, 0.65)` | Error and End trip outline |
| `dangerFill` | `--wl-color-danger-fill` | `danger-fill` | `rgba(96, 22, 30, 0.7)` | Error and End trip fill |
| `ok` | `--wl-color-ok` | `ok` | `#46d08b` | The online dot |
| `glass` | `--wl-color-glass` | `glass` | `rgba(10, 13, 18, 0.85)` | Flat panel fill, about 85 percent opaque |
| `glassNight` | `--wl-color-glass-night` | `glass-night` | `rgba(10, 13, 18, 0.78)` | Panel fill after dark, a little more see-through |
| `glassDay` | `--wl-color-glass-day` | `glass-day` | `rgba(10, 13, 18, 0.94)` | Panel fill in daylight, more solid for sun readability |
| `glassBorder` | `--wl-color-glass-border` | `glass-border` | `rgba(255, 255, 255, 0.1)` | Hairline panel edge |
| `credits` | `--wl-color-credits` | `credits` | `#020306` | The reserved credits strip |

The default Tailwind palette is switched off, so classes like `bg-red-500` do not exist. Use the token names above, for example `bg-night-950`, `text-text-secondary` or `border-glass-border`.

Contrast on `night-950` (WCAG 2): `text` 17.8:1, `text-secondary` 14.2:1, `text-muted` 10.1:1, `cyan` 10.5:1, `caution` 10.3:1, `danger` 8.2:1. On `night-800` panels they are 16.0, 12.8, 9.1, 9.4, 9.2 and 7.4. All pass AA for body text. Dark text on `cyan` buttons is 10.5:1. The secondary and muted greys were brightened (from `#a4acb7` and `#747d89`) after a device test showed them unreadable on a bright sky. Text over the 3D scene sits on its own small plate, see "Text on the scene" below.

## Typography

Waylit uses the platform's system UI font (`font.sans`). It is legible at small sizes, has tabular figures for live numbers, costs no download, and needs no network call at build or run time. A custom typeface can be added later if it is openly licensed and self-hosted.

| Token | Tailwind | Size | Use |
|---|---|---|---|
| `xs` | `text-xs` | 0.75rem | Attribution, fine print |
| `sm` | `text-sm` | 0.875rem | Labels, secondary values |
| `base` | `text-base` | 1rem | Body |
| `lg` | `text-lg` | 1.25rem | Lead text |
| `xl` | `text-xl` | 1.5625rem | Panel headings |
| `2xl` | `text-2xl` | 1.953rem | Large readouts on ordinary pages |
| `3xl` | `text-3xl` | 2.441rem | Secondary readouts |
| `display` | `text-display` | 4rem | Page titles on the home screen |
| `speed` | `text-speed` | `clamp(3rem, 20dvh, 6.5rem)` | Vehicle speed on the riding screen |
| `hudTurn` | `text-hud-turn` | `clamp(1.25rem, 8dvh, 2.5rem)` | Distance to the next turn |
| `hudLg` | `text-hud-lg` | `clamp(0.875rem, 4dvh, 1.3rem)` | Street instruction, clock, temperature |
| `hudDock` | `text-hud-dock` | `clamp(0.8rem, min(3.5dvh, 1.9vw), 1.2rem)` | Values in the dock, which is the tightest row |
| `hudMd` | `text-hud-md` | `clamp(0.75rem, 3.3dvh, 1.05rem)` | Time and distance left, labels, speed unit |
| `hudSm` | `text-hud-sm` | `clamp(0.6875rem, 2.7dvh, 0.875rem)` | Captions, arrival time, credits |

The base scale is a major third (1.25) from a 1rem base. The riding screen uses the fluid `speed` and `hud*` sizes instead, which scale with the viewport (`dvh` and `vw`) so one set of values fits every landscape phone without clipping. At 915 by 412 the speed is about 82 px tall type, and its digits are about 15 percent of the screen height: large enough for a glance, small enough to leave the scene clear (it was about 30 percent before the redesign of 2026-11-26).

Line heights are `tight` (1.1) for display numbers, `snug` (1.3) for headings and `normal` (1.5) for body. Weights are 400, 500, 600 and 700. The speed number is weight 500 with `tracking-speed` (-0.05em) and a line height under 1. Other display text uses `tracking-display` (-0.02em). Use `tabular-nums` on any number that updates live, so digits do not jump.

Sentence case everywhere. No all caps labels.

## Spacing

A 4px grid. The tokens are `space.0` to `space.8` (0, 4, 8, 12, 16, 24, 32, 48 and 64 px). Tailwind's default spacing scale is also 4px based, so `p-4` equals `space.4` and `gap-6` equals 24px.

## Radius

Radius follows hierarchy rather than one value everywhere.

| Token | Value | Use |
|---|---|---|
| `sm` | 6px | Small chips inside panels, focus ring |
| `tile` | 10px | Artwork tile |
| `md` | 12px | Buttons and controls |
| `lg` | 20px | The joined dock and other HUD panels |
| `pill` | 999px | Status pills, progress tracks |

## Blur, glow and panels

| Token | Value | Use |
|---|---|---|
| `blur.sm` | 8px | Small overlays |
| `blur.md` | 16px | Standard overlay |
| `blur.lg` | 28px | Full screen sheets |
| `glow.cyan` | `0 0 18px rgba(95, 200, 232, 0.45)` | The 3D scene's route and heading marker only |
| `glow.focus` | `0 0 0 3px rgba(95, 200, 232, 0.6)` | Keyboard focus ring |

The HUD uses no blur and no glow. The `.wl-glass` component class is a flat translucent panel: the fill from the `--wl-panel` variable (default `glass`), a hairline `glassBorder` border and `radius.lg`. The blur tokens exist for later overlays and are not used by the riding screen.

**Day and night.** The riding screen works out how much daylight there is from the sun's elevation at the rider's position and the time (see [ARCHITECTURE.md](ARCHITECTURE.md), "Day and night") and sets two CSS variables on its root: `--wl-daylight`, from 0 (dark) to 1 (full day), and `--wl-warmth`, from 0 to 1, which peaks when the sun is at the horizon. The factor rises smoothly from a sun elevation of -6 degrees (end of civil twilight) to +6 degrees (top of golden hour), so nothing switches at a fixed hour and a sunrise or sunset fades over about 25 minutes. In CSS, `[data-daylight]` sets `--wl-panel` to a `color-mix` of `glassDay` and `glassNight` weighted by `--wl-daylight`: panels are more solid in sunlight (94 percent), a little more see-through at night (78 percent), and in between at dawn and dusk (about 86 percent at sunrise). Browsers without `color-mix` fall back to `data-daylight="true"` or `"false"` and the two fixed fills. The placeholder scene gradient is tinted the same way, a touch lighter and bluer in the day and warmer at the bottom around sunrise and sunset. That tint is a stand in for the 3D lighting of task 8, which reads the same values from `useDaylight()`.

## Text on the scene

The scene can be a bright blue sky, sunlit pale ground or a dark street, and it is never darkened to help the HUD. There is no screen wide scrim, no gradient across the screen and no vignette (a rider found the old daylight scrim, a dark gradient over the top 60 percent of the screen, jarring). Readability comes only from local aids, each the size of the thing it helps:

| Token | CSS variable | Value | Use |
|---|---|---|---|
| `plate.night` | `--wl-plate-night` | `0.74` | Opacity of a text plate in the dark |
| `plate.day` | `--wl-plate-day` | `0.84` | Opacity in full daylight |
| `shadow.text` | `--wl-shadow-text` | `0 0 1px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.6)` | A tight edge on glyphs, two pixels at most |

- **Plates** (`.wl-plate`). Each group of text over the scene sits on its own small plate of dark glass (`night950`), sized to the text: the speed and turn card top left, the status chip top right, the start caption, the map note and the dev overlay. The map settings button also sits on a plate so its icon reads on a bright sky. The opacity is `night + (day - night) * --wl-daylight`, one flat fill with a hairline border, no blur and no gradient, so it costs almost nothing on a mid range phone. The plate is a little more solid in sunlight and a little lighter at night.
- **Glass** (`.wl-glass`). The dock, the minimap and the map settings sheet keep their own glass fill, which covers only the panel itself.
- **Text edge** (`.wl-hud-text`). A tight dark edge on the glyphs of plate text keeps them crisp in glare. It is never used as a backdrop.
- **Adaptive colour.** Text over the scene uses only `text`, `text-secondary`, `caution` and `cyan`. Muted grey is for panels only. The turn arrow turns cyan when the turn is imminent.
- **Contrast.** The plate's floor is chosen so that every text colour allowed on it passes WCAG AA over pure white, which is brighter than anything the scene can draw. `apps/web/src/hud/readability.test.ts` checks every text colour at daylight 0, 0.25, 0.5, 0.75 and 1 against pure white, pure black, the day palette and sky, a pale sunlit photographic ground (#e8e4d8, an assumed worst case, not measured on a real Google tile screenshot), the night palette and the bright hologram cyan, and the dock text on night and day glass. The layout check (`apps/web/scripts/layout-check.mjs`) does the same in Chrome with the colours the browser computed, while riding, at five sizes. The lowest ratios (night plate over pure white) are: `text` 8.2:1, `text-secondary` 6.5:1, `caution` 4.7:1 and `cyan` 4.8:1. Over pure black they are all above 10:1.
- **Guard.** `apps/web/src/hud/no-screen-darkening.test.ts` fails if a scrim, a screen wide gradient, a full screen fill, a vignette or a wide text shadow comes back, in the CSS, the components, the tokens or the scene's post process. The layout check also fails if anything but the scene, the credits strip or an opened dialog paints more than 20 percent of the screen or a band across it.

## Futuristic look

The 3D scene has a screen space colour grade and edge glow (see [ARCHITECTURE.md](ARCHITECTURE.md), "Visual effects and the Google terms"). It keeps the palette: deep navy and teal, controlled contrast, slight desaturation, with the cyan accent as the edge glow and nothing else coloured. It never darkens by screen position: the vignette and the horizon haze band were removed in the HUD redesign, so the corners and the middle of the picture stay as bright as the scene. With the effect on, night photographic tiles are dimmed to about a third and tinted cool, never crushed toward black. Day is cooler and cleaner, sunset a warm magenta to cyan split tone, night deep blue with glowing cyan edges. It is a HUD-free effect on the scene only, the HUD palette does not change. Original screenshots from the procedural preview scene (not Google tiles): [noon](images/fx-preview-noon.png), [sunset](images/fx-preview-sunset.png), [night](images/fx-preview-night.png) and [night with the effect off](images/fx-preview-night-off.png).

## Hologram guidance

The route is drawn as a hologram with one cyan accent. Amber and red are kept for warnings and errors only.

| Use | Value |
|---|---|
| Edge lines, floor lines, chevrons | `#5fc8e8` (`HOLO_CYAN`) |
| Bright rails, beacon, label text | `#67e8f9` (`HOLO_CYAN_BRIGHT`) |
| Route ribbon fill | `#38bdf8` at 0.22 alpha (`HOLO_RIBBON`) |
| Dark glass | `#04141f` (`HOLO_GLASS`) |

The ribbon is 3.4 m wide with 0.22 m rails. Chevrons float ahead of the rider and bend toward the next turn. The turn beacon is a vertical column with a pill label that shows the turn arrow, the distance countdown (for example "120 m") and a smaller unit, with a brighter tone when the turn is imminent. The rider is a scanline silhouette on an original stylised kick scooter with a ring and cone heading marker at the base. A single scan band sweeps up the scene every 9 seconds (the fallback DOM band is hidden with reduced motion). The label sits in `.wl-scene-overlay` inside the scene, so it never covers the credits strip. Original screenshots from the procedural preview: [MapLibre night](images/holo-preview-maplibre-night.png) and [CesiumJS night](images/holo-preview-cesium-night.png).

## Map settings

A quiet round control (44 pixels, a stacked layers icon, glass border) sits beside the minimap and turns cyan while its sheet is open. The sheet is the same dark glass as the dock, with two exclusive rows of 44 pixel choices: the checked one has a cyan border, a faint cyan fill and cyan text, the others are quiet grey. A disabled choice is dimmed and its reason is written under the row in muted text, never in red or amber, because having no token or an address override is not a fault. Above 8 km/h the button shows the hold ring like every other guarded control, and the sheet closes by itself. Screenshot from the procedural preview: [map settings sheet](images/map-settings-sheet-915x412.png).

### Position row, GPS note and free ride

The settings sheet has a third exclusive row, **Position** (Simulator, Phone GPS), in the same 44 pixel style, with the ground height field below it on a free ride on Google tiles. The row is only changeable before a trip, and says so in muted text. `GpsNote` is a small status plate in the clear middle, shown only in a free ride, for a signal that needs attention: amber (`caution`) for weak, lost, blocked or unavailable, quiet info for waiting for a fix, never red. A free ride replaces the turn column with "Free ride" and a one line explanation, and the minimap shows only the rider dot, cone and compass.

## Motion

| Token | Value | Use |
|---|---|---|
| `motion.fast` | 120ms | Press feedback |
| `motion.base` | 200ms | Hover, small state changes |
| `motion.slow` | 360ms | Panels opening and closing |
| `motion.easeOut` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default easing (`ease-out` in Tailwind) |

## Layout

The riding screen is landscape first. Phones in landscape can be as short as 360px, so the web app defines a `short:` Tailwind variant for viewports up to 520px tall, and a `tight:` variant for up to 400px. Use it to tighten spacing and step type down one size rather than hiding information a rider needs. Respect safe areas with `env(safe-area-inset-*)` once the full screen PWA shell lands.

## Riding screen layout

Built in `apps/web/src/app/ride/page.tsx`, with the layout in `apps/web/src/hud/HudFrame.tsx` (shared with the dev preview) and the parts in `apps/web/src/hud/`. The scene fills the whole screen and the HUD floats on it. There are no solid bars and no darkening layer. The HUD is a grid of three rows: the top area (which grows), the dock, and the credits strip. It was checked at 915 by 412 (Samsung Galaxy A35 in landscape, in CSS pixels), 915 by 422 (the A35's 2340 by 1080 pixels at its device pixel ratio, which is the fullscreen height), 740 by 360, 667 by 375, 800 by 360 and 1280 by 720, in the start, riding, telemetry lost and summary states.

| Area | Content |
|---|---|
| Top left, one plate | The speed and the next turn on one small plate of dark glass, sized to the text. Left: the vehicle speed (the biggest number, digits about 15 percent of the screen height), and under it, small: `km/h` and `GPS 17`, the GPS speed shown separately, and the amber telemetry note when it applies. A hairline divider. Right: the turn arrow (cyan when the turn is imminent) and the distance to the turn, the street instruction, then one quiet line with the time and distance left and `Arrive 14:35` |
| Top right | A status chip on a plate: local time, mock temperature and a small connectivity dot (green online, amber offline). Under it, the map settings button on its own plate beside a round plain SVG minimap about 82 px across at 915 by 412: route line, position dot and a heading cone. No tiles and no map data. The dev overlay and the quiet map note sit under the minimap and stop above the centre row |
| Centre | Clear for the 3D scene, with nothing drawn over it. The start prompt (the Start trip button, a "Light follows my clock" or "Real sun at the route" switch beside it, and a caption) appears low in the clear middle before a trip, and the dev controls (development and `?dev=1` only) sit below it. They are always one row of 44 px buttons, so nothing overlaps at any landscape size, and the Time button swaps that row for the time override page (Back, Live, Dawn, Noon, Sunset, Night, a time slider and a date field) |
| Dock | One joined glass dock, 20 px corners, about 15 percent of the screen height, sized to its content and centred at the bottom with margin on both sides (never wider than 80 percent of the screen, or 42rem on small phones where the content needs it), with a hairline divider between two halves. Left: artwork tile, title and artist, previous, play or pause, next, and a thin progress line along the bottom of the half. Right: battery icon and percent, range, trip distance and time (`3.2 km · 12:40`), and End trip at the far right |
| Credits strip | The reserved credits row below the dock: a darker band that nothing overlaps, holds the scene's attributions: the Google logo, data credits and Cesium ion logo with CesiumJS, or OpenFreeMap, OpenMapTiles and OpenStreetMap contributors with the fallback. The scene renders them into the strip and the HUD never covers it. Its minimum height follows the screen height (`clamp(1.5rem, 6.5dvh, 2rem)`) and grows with its content. A faint placeholder label shows only in development or with `?dev=1`, until the scene is ready |

Rules for this screen:

- **Fullscreen, with our own top strip.** The installed app runs fullscreen (see [PWA.md](PWA.md)), so the phone's status bar and navigation bar are hidden and the screen draws its own: time, temperature and the online dot top right, speed and turn top left. Everything keeps at least the safe area inset, with a small minimum margin for rounded corners, so nothing sits under the camera cutout.
- **Nothing in the bottom corners outside the dock.** No floating vertical buttons, no distance scale and no zoom controls.
- **Large targets.** Media buttons are round and at least 44 pixels across, and End trip is at least 44 pixels tall. End trip is the one red control, and red is otherwise only for errors.
- **Speed guard.** Above 8 km/h the media controls and End trip need a hold (0.6 s, and 0.9 s for End trip). The guard switches off below 5 km/h.
- **Hold feedback that does not need animation.** While the guard is on, each media button shows a ring track that says a hold is needed. While a button is held the ring fills over the hold time, the button takes a cyan edge and a stronger fill, and the artist line says "Keep holding". End trip says "Hold to end", grows a red fill while held, and says "Keep holding". With reduced motion the ring and fill skip the growth and show complete as soon as the hold starts, so the filled state and the caption are still there.
- **Missing data shows dashes**, never zero. An amber note with a small icon under the speed says when GPS is standing in for the scooter, and the GPS speed label turns amber.
- **Small glass, never a backdrop.** The speed and turn card, the status chip and the map settings button sit on plates sized to their content, and the dock, minimap and dev controls are glass panels. Nothing paints across the screen apart from the credits strip.
- **Minimap.** Plain drawn route only. While riding it follows the rider with the heading up, shows a clear heading cone (a 34 unit wedge opening 32 degrees either side, a gradient fill from 80 to 20 percent cyan with an outline), and a small N on the rim. Before and after a trip it shows the whole route inside the circle, north up.
- **Contrast.** The top text sits on its plate (see "Text on the scene") and passes AA over pure white. The dock is more solid in daylight and fades smoothly with the sun. Sunlight readability on a real screen still needs a check on the phone.
- **Fluid type.** Sizes use `clamp` with `dvh` and `vw` (see Typography). The dock values also scale with width, because the dock is the tightest row. The dock is sized to its content. The track title block has a fixed fluid width (about 15 percent of the screen width, at least 7.75 rem), so the dock does not change width from track to track, and at 667 by 375 the longest mock title still fits whole and a long artist line ends in an ellipsis. Neither pushes the media buttons or End trip off the screen, and nothing else clips.
- **Motion.** The plates and the dock settle in when the screen appears (`.wl-enter`: a 360 ms fade and a 6 pixel rise, the dock 80 ms later), and the turn arrow fades to cyan when the turn is imminent.
- **Reduced motion.** See hold feedback above. The offline pulse and the entrance stop. Nothing else on this screen animates.
- **No speed limit sign yet.** There is no road speed limit data in milestone 1 (speed zones are phase 4, out of scope), so no sign is drawn and none is invented. A small sign under the speed is a later item for when speed zone data exists.
- **Copy.** Sentence case, no emoji, no em dashes. Speed in km/h, distances under 1 km in metres rounded to 10 m, longer ones in km with one decimal, 24 hour time.
- **Variants.** `short:` is for screens up to 520 px tall and `tight:` is for up to 400 px tall. The riding screen no longer needs them because its sizes are fluid, and they remain for other screens.

Screenshots of the screen, taken from a production build with headless Chrome, are in [`docs/images/`](images/): [riding at 915 by 412](images/ride-915x412-riding.png), [start at 915 by 412](images/ride-915x412-start.png), [telemetry lost at 915 by 412](images/ride-915x412-fallback.png) (taken with `?dev=1`, so the dev controls show) and [riding at 1280 by 720](images/ride-1280x720-riding.png) and [the trip summary at 915 by 412](images/ride-915x412-summary.png). The same screen with the dev time override at [dawn](images/ride-915x412-dawn.png), [noon](images/ride-915x412-noon.png), [sunset](images/ride-915x412-sunset.png) and [night](images/ride-915x412-night.png), taken at 915 by 412 with `?dev=1&time=dawn` and so on, for Berlin on 25 November. Day shows the dock at its most solid and a bluer scene, sunset and dawn show the warm glow at the horizon and a mid fill, and night is the darkest with the most see-through dock. These were re-shot for the HUD redesign on 26 November 2026. In headless Chrome the fallback map's tiles do not load, so the scene there is the sky, the light and the hologram only.

The redesigned HUD over the procedural preview scene (`/dev/holo-preview?dev=1&hud=1&engine=cesium|maplibre&time=...&along=110`, no Google tiles and no network), with the real `HudFrame` and panels and fixed mock values: CesiumJS at [noon](images/hud-preview-cesium-noon.png), [sunset](images/hud-preview-cesium-sunset.png) and [night](images/hud-preview-cesium-night.png), the same noon with [the effect off](images/hud-preview-cesium-noon-fx-off.png), and MapLibre at [noon](images/hud-preview-maplibre-noon.png), [sunset](images/hud-preview-maplibre-sunset.png) and [night](images/hud-preview-maplibre-night.png). The pale noon buildings are the worst case for the top text, and the scene stays clear to every edge.

## Using the tokens

On the web, prefer Tailwind classes. Where a value is needed in custom CSS, use the variable, for example `var(--wl-color-cyan)`. In TypeScript, import values directly:

```ts
import { color, radius } from "@waylit/ui-tokens";
```

To add or change a token, edit `tokens.ts`, mirror it in `tokens.css`, map it in `globals.css` if Tailwind needs it, update the tables on this page, and run `pnpm test`.
