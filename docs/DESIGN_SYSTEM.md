# Design system

Waylit should feel like a calm cockpit at night: a deep blue dark base, translucent glass panels, and light that comes from the route itself. Electric blue marks the route and primary actions. Cyan marks holographic elements and live data. Everything else stays quiet so the 3D view leads.

The tokens live in [`packages/ui-tokens`](../packages/ui-tokens). `src/tokens.ts` is the source of truth and works on any platform. `src/tokens.css` exposes the same values as CSS custom properties prefixed `--wl-`, and a test fails if the two files drift apart. The web app maps the variables into Tailwind in `apps/web/src/app/globals.css`.

## Principles

1. **The world leads, the HUD supports.** Panels are translucent and compact. If a panel competes with the road, make it smaller or quieter.
2. **Glanceable first.** Numbers a rider reads while moving (speed, distance to the next turn) use the display size and tabular figures. Secondary text is smaller and dimmer.
3. **Light means information.** Glow is reserved for the route, the heading marker, focus and live state. Decorative glow on static chrome is avoided.
4. **Colour has a job.** Blue is the route and primary actions. Cyan is holographic and live. Amber is only for caution and safety notices. Red is only for errors and the End Trip action.
5. **Large targets.** Anything touchable is at least 48 by 48 pixels (`touch.min`).
6. **Performance over polish.** Backdrop blur is expensive on mid-range phones. Use one glass layer per panel, not nested glass, and provide the solid fallback that `.wl-glass` already includes.
7. **Respect reduced motion.** Ambient animation stops under `prefers-reduced-motion`. Motion that answers a rider's action may stay but should be short.
8. **Original identity.** No vehicle maker, car maker or map provider branding, colours or logos.

## Colour

| Token | CSS variable | Tailwind | Value | Use |
|---|---|---|---|---|
| `night950` | `--wl-color-night-950` | `night-950` | `#05080f` | App background |
| `night900` | `--wl-color-night-900` | `night-900` | `#0a1220` | Raised background |
| `night800` | `--wl-color-night-800` | `night-800` | `#121c2e` | Solid panels, inputs |
| `night700` | `--wl-color-night-700` | `night-700` | `#1c2940` | Dividers, tracks |
| `volt` | `--wl-color-volt` | `volt` | `#2e8bff` | Route, primary actions |
| `voltSoft` | `--wl-color-volt-soft` | `volt-soft` | `#7fb6ff` | Hover, secondary route |
| `cyan` | `--wl-color-cyan` | `cyan` | `#35e0ff` | Holographic elements, focus |
| `cyanSoft` | `--wl-color-cyan-soft` | `cyan-soft` | `#a6f1ff` | Chevrons, live highlights |
| `text` | `--wl-color-text` | `text` | `#eaf3ff` | Primary text |
| `textSecondary` | `--wl-color-text-secondary` | `text-secondary` | `#9db0cc` | Labels, supporting text |
| `textMuted` | `--wl-color-text-muted` | `text-muted` | `#6e82a4` | Hints, metadata |
| `caution` | `--wl-color-caution` | `caution` | `#ffb23f` | Safety notices, warnings |
| `danger` | `--wl-color-danger` | `danger` | `#ff5a6b` | Errors, End Trip |
| `ok` | `--wl-color-ok` | `ok` | `#3ddc97` | Connected, healthy |
| `glass` | `--wl-color-glass` | `glass` | `rgba(14, 24, 42, 0.55)` | Glass panel fill |
| `glassStrong` | `--wl-color-glass-strong` | `glass-strong` | `rgba(14, 24, 42, 0.78)` | Glass fallback without blur |
| `glassBorder` | `--wl-color-glass-border` | `glass-border` | `rgba(150, 200, 255, 0.14)` | Panel edge |
| `glassHighlight` | `--wl-color-glass-highlight` | `glass-highlight` | `rgba(166, 241, 255, 0.08)` | Top sheen on glass |

The default Tailwind palette is switched off, so classes like `bg-red-500` do not exist. Use the token names above, for example `bg-night-950`, `text-text-secondary` or `border-glass-border`.

Contrast on `night-950` (WCAG 2): `text` 17.9:1, `text-secondary` 9.1:1, `text-muted` 5.1:1, `caution` 11.2:1. All pass AA for body text. On `night-800` panels `text-muted` drops to about 4.4:1, so keep it for hints there. Dark text on `volt` buttons is 6.0:1.

## Typography

Waylit uses the platform's system UI font (`font.sans`). It is legible at small sizes, has tabular figures for live numbers, costs no download, and needs no network call at build or run time. A custom typeface can be added later if it is openly licensed and self-hosted.

| Token | Tailwind | Size | Use |
|---|---|---|---|
| `xs` | `text-xs` | 0.75rem | Attribution, fine print |
| `sm` | `text-sm` | 0.875rem | Labels, secondary values |
| `base` | `text-base` | 1rem | Body |
| `lg` | `text-lg` | 1.25rem | Instruction text |
| `xl` | `text-xl` | 1.5625rem | Panel headings |
| `2xl` | `text-2xl` | 1.953rem | Distance to next turn |
| `3xl` | `text-3xl` | 2.441rem | Secondary readouts |
| `display` | `text-display` | 4rem | Speed readout |

The scale is a major third (1.25) from a 1rem base. Line heights are `tight` (1.1) for display numbers, `snug` (1.3) for headings and `normal` (1.5) for body. Weights are 400, 500, 600 and 700. Display text uses `tracking-display` (-0.02em). Use `tabular-nums` on any number that updates live, so digits do not jump.

Sentence case everywhere. No all caps labels.

## Spacing

A 4px grid. The tokens are `space.0` to `space.8` (0, 4, 8, 12, 16, 24, 32, 48 and 64 px). Tailwind's default spacing scale is also 4px based, so `p-4` equals `space.4` and `gap-6` equals 24px.

## Radius

Radius follows hierarchy rather than one value everywhere.

| Token | Value | Use |
|---|---|---|
| `sm` | 6px | Small chips inside panels, focus ring |
| `md` | 12px | Buttons and controls |
| `lg` | 20px | HUD panels and sheets |
| `pill` | 999px | Status pills, progress tracks |

## Blur, glow and glass

| Token | Value | Use |
|---|---|---|
| `blur.sm` | 8px | Small overlays |
| `blur.md` | 16px | Standard glass panel |
| `blur.lg` | 28px | Full screen sheets |
| `glow.volt` | `0 0 24px rgba(46, 139, 255, 0.35)` | Primary action, route |
| `glow.cyan` | `0 0 18px rgba(53, 224, 255, 0.45)` | Holographic elements |
| `glow.focus` | `0 0 0 3px rgba(53, 224, 255, 0.6)` | Keyboard focus ring |

In Tailwind these are `backdrop-blur-md`, `shadow-glow-volt`, `shadow-glow-cyan` and `shadow-glow-focus`.

The `.wl-glass` component class combines the glass fill, a faint top sheen, the border, `radius.lg` and `blur.md`. It falls back to `glassStrong` with no blur where `backdrop-filter` is not supported.

## Motion

| Token | Value | Use |
|---|---|---|
| `motion.fast` | 120ms | Press feedback |
| `motion.base` | 200ms | Hover, small state changes |
| `motion.slow` | 360ms | Panels opening and closing |
| `motion.easeOut` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default easing (`ease-out` in Tailwind) |

## Layout

The riding screen is landscape first. Phones in landscape can be as short as 360px, so the web app defines a `short:` Tailwind variant for viewports up to 520px tall. Use it to tighten spacing and step type down one size rather than hiding information a rider needs. Respect safe areas with `env(safe-area-inset-*)` once the full screen PWA shell lands.

## Using the tokens

On the web, prefer Tailwind classes. Where a value is needed in custom CSS, use the variable, for example `var(--wl-color-cyan)`. In TypeScript, import values directly:

```ts
import { color, radius } from "@waylit/ui-tokens";
```

To add or change a token, edit `tokens.ts`, mirror it in `tokens.css`, map it in `globals.css` if Tailwind needs it, update the tables on this page, and run `pnpm test`.
