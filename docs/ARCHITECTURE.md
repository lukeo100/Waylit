# Architecture

Waylit is a pnpm workspace monorepo. The web app is one consumer of a set of small shared packages. A later Expo app will be a second consumer of the same packages, so anything that is not specific to the browser lives outside `apps/web`.

This page describes what exists today. Most packages hold interfaces and placeholders, and fill in as the milestone 1 tasks land (see [AGENT_BRIEF.md](AGENT_BRIEF.md)).

## Layout

```
apps/
  web/                 Next.js App Router app (the PWA). Rendering, pages, browser APIs.
packages/
  core/                Navigation types, unit conversions, geo helpers. No DOM, no React.
  vehicle/             Read-only vehicle interface and mock adapter types. No DOM, no React.
  map-provider/        Map provider interface types. No DOM, no React, no provider SDKs.
  ui-tokens/           Design tokens as TypeScript values plus a CSS variables file.
```

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
