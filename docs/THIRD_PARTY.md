# Third party licences and attributions

Everything Waylit uses that it did not write itself is recorded here with its licence and any attribution it requires. Add an entry in the same pull request that introduces a new dependency, data source or asset.

## Dependencies

Direct dependencies are pinned in `pnpm-lock.yaml`. Versions below are the ranges in each `package.json` at the time of writing. All are compatible with Apache 2.0. Run `pnpm licenses list` for the full transitive list.

### Runtime (shipped to the browser)

| Package | Version | Licence | Used for |
|---|---|---|---|
| next | 16.4.6 | MIT | Web app framework (App Router) |
| react | 19.3.1 | MIT | UI library |
| react-dom | 19.3.1 | MIT | React renderer for the web |

### Build and development only (not shipped)

| Package | Licence | Used for |
|---|---|---|
| typescript | Apache-2.0 | Type checking |
| tailwindcss, @tailwindcss/postcss | MIT | Styling, themed from the design tokens |
| eslint, @eslint/js | MIT | Linting |
| typescript-eslint | MIT | TypeScript lint rules |
| @next/eslint-plugin-next | MIT | Next.js lint rules |
| eslint-plugin-react-hooks | MIT | React Hooks lint rules |
| eslint-config-prettier | MIT | Turns off lint rules that clash with Prettier |
| prettier | MIT | Code formatting |
| vitest | MIT | Unit tests |
| @types/node, @types/react, @types/react-dom | MIT | Type definitions |

### Notable transitive licences

Most transitive packages are MIT, ISC, BSD or Apache 2.0. A few differ, none are copied into this repository, and none are linked into Waylit source:

| Package | Licence | Pulled in by | Notes |
|---|---|---|---|
| lightningcss | MPL-2.0 | Tailwind CSS (build only) | File-level copyleft. Used unmodified as a build tool |
| caniuse-lite | CC-BY-4.0 | Browser target data (build only) | Data used by build tools, not shipped |
| sharp, @img/sharp-* | Apache-2.0, with libvips binaries under LGPL-3.0-or-later | Optional dependency of Next.js for image optimisation | Installed but unused, as the app does not use `next/image` optimisation. Not bundled into the client. Revisit before adopting image optimisation or shipping a Docker image that includes it |
| minimatch, graceful-fs | BlueOak-1.0.0 | Tooling | Permissive |

Candidates under evaluation, not yet adopted: CesiumJS (Apache 2.0), three.js (MIT), MapLibre GL JS (BSD-3-Clause). The mapping spike decides between them. Each must be checked for compatibility with Apache 2.0 when adopted.

### PWA shell

The PWA shell (manifest, service worker, install flow, wake lock) adds no dependencies. The service worker is hand written, and the icon generator uses only Node.js built-ins (`zlib`, `fs`). It does not use the optional `sharp` package that Next.js installs.

### Fonts

None. The app uses the platform's system UI font, so no font files are bundled or downloaded.

## Data sources and required attributions

| Source | Licence or terms | Required attribution |
|---|---|---|
| OpenStreetMap data | Open Database Licence (ODbL) | Show "© OpenStreetMap contributors", linked to https://www.openstreetmap.org/copyright, in the app wherever its data or tiles are displayed |
| Google Map Tiles API and Photorealistic 3D Tiles | Google Maps Platform terms, to be verified in the mapping spike | Whatever the terms require, shown in the app. Not adopted until verified |
| Cesium ion hosted assets | Cesium ion terms, to be verified in the mapping spike | Cesium ion and data provider credits as required |

Anyone deploying Waylit supplies their own keys and agrees to the provider terms themselves. Waylit does not ship or share any provider key.

## Assets

Scooter and rider models, icons, sample media and artwork are created for this project and released under the project licence unless an entry below says otherwise. No third party copyrighted assets are included.

| Asset | Source | Licence |
|---|---|---|
| App icons and logo (`apps/web/public/icons/`) | Drawn for this project by `apps/web/scripts/generate-icons.mjs` | Project licence (Apache-2.0) |
| Rotate phone icon (inline SVG in `RotateOverlay`) | Drawn for this project | Project licence (Apache-2.0) |

## Names and trademarks

Segway, Ninebot, Tesla, Google, Cesium and OpenStreetMap are names of their respective owners. Waylit is not affiliated with or endorsed by any of them. The names appear only to describe vehicle compatibility, data sources or design inspiration.
