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

Adopted for the 3D scene (task 8): CesiumJS and MapLibre GL JS. three.js is not used.

| Package | Licence | Notes |
|---|---|---|
| `@cesium/engine` 26.5.0, `@cesium/core` 0.1.1 (and its `@cesium/gltf`, `@cesium/wasm-splats`) | Apache-2.0 | The CesiumJS engine and widget, without the Viewer. Loaded only on the riding screen. Its workers and assets are copied to `apps/web/public/cesium` at build time |
| `maplibre-gl` 6.19.0 | BSD-3-Clause | The fallback renderer. Its worker is copied to `apps/web/public/maplibre` |
| `dompurify` | MPL-2.0 OR Apache-2.0 | Pulled in by CesiumJS. Used under Apache-2.0 |
| `draco3d`, `lerc`, `meshoptimizer`, `ktx-parse`, `pako`, `protobufjs`, `urijs`, `autolinker`, `rbush`, `earcut` and similar | Apache-2.0, MIT, BSD or ISC | Pulled in by CesiumJS and MapLibre. All compatible with Apache-2.0 |

The versions are pinned exactly and the lockfile is committed. Run `pnpm licenses list --prod --filter web` to see the full list.

### PWA shell

The PWA shell (manifest, service worker, install flow, wake lock) adds no dependencies. The service worker is hand written, and the icon generator uses only Node.js built-ins (`zlib`, `fs`). It does not use the optional `sharp` package that Next.js installs.
### Simulation layer

The simulation layer adds no dependencies. The filters, random number generator, route handling, energy model and Web Audio synthesis are written for this project.

### Riding screen

The riding screen itself adds no dependencies (the 3D scene is described below). Icons are original inline SVG drawn for Waylit, the minimap is plain SVG from the demo route's own coordinates, and mock weather is a fixed value. The minimap is not a map: it never contains map tiles or OpenStreetMap data. The 3D scene renders the required map credits into the credits strip. The HUD redesign (floating HUD, one joined dock, round minimap) added no dependencies either, and the screenshots in `docs/images` are original captures of the app taken with headless Chrome, with no third party content in them.

### Sun and daylight

The solar module (`packages/core/src/solar.ts`) adds no dependencies. It implements the NOAA solar position algorithm, a published procedure from the US National Oceanic and Atmospheric Administration, Global Monitoring Laboratory, itself based on Jean Meeus, "Astronomical Algorithms". The algorithm and its equations are public domain US government work, and equations and facts are not copyrightable. The code is an original implementation written from the published equations. No code was copied from SunCalc or any other library, and none is a dependency.

The follow my clock mapping (`packages/core/src/sun-moment.ts`) and the futuristic effect (`packages/map-provider/src/fx.ts`, `apps/web/src/map/fx-shader.ts`) add no dependencies. The GLSL is original code written for Waylit (a luminance Sobel filter and a colour grade are standard image processing ideas, and nothing was copied from any shader library, example or other project). Their screenshots in `docs/images/fx-preview-*.png` show a procedural scene of boxes drawn by Waylit under the Cesium sky, not Google tiles.

The reference values in `solar.test.ts` are numbers (sun positions and times), not code. They were generated once with PyEphem 4.2 (LGPL-3.0, using the VSOP87 theory), as an independent check, and PyEphem is not a dependency, is not installed by the project and is not shipped. The source of the values is stated in the test file.

### Hologram look and the Google terms

The hologram look adds no dependency. For Google Photorealistic 3D Tiles the corridor is a GPU stencil classification at a constant ground height and the other items are flat translucent primitives, with no read of tile heights, geometry or depth and no tile caching. Terms 3.2.3(c) forbids creating content based on Google Maps Content. A classification overlay and a per fragment screen effect make no copy, but the terms do not clearly allow them either, so this is a documented grey area. The screen effect is off by default for Google tiles (`GOOGLE_FX_ON_BY_DEFAULT = false`) and the maintainer decides whether to accept the risk after reading the Map Tiles Policies and Terms 3.2.3. The MapLibre fallback uses open data only and has no such restriction. See [ARCHITECTURE.md](ARCHITECTURE.md), "Holographic guidance".

### Fonts

None. The app uses the platform's system UI font, so no font files are bundled or downloaded.

## Data sources and required attributions

| Source | Licence or terms | Required attribution |
|---|---|---|
| OpenStreetMap data | Open Database Licence (ODbL) | Show "© OpenStreetMap contributors", linked to https://www.openstreetmap.org/copyright, in the app wherever its data or tiles are displayed |
| Google Photorealistic 3D Tiles, served through Cesium ion (asset 2275207) | Google Maps Platform terms and Cesium ion terms. The owner of a deployment accepts them with their own Cesium ion account | The Google logo and the data credits Google requires, plus the Cesium ion logo, shown by CesiumJS in the credits strip, never covered. Waylit never reads heights from these tiles, never caches them and never reuses them outside the live view |
| OpenFreeMap vector tiles (fallback) | Free public service, data under ODbL, schema by OpenMapTiles (CC-BY 4.0) | "OpenFreeMap", "© OpenMapTiles" and "© OpenStreetMap contributors" in the credits strip |
| Mapterhorn terrain tiles (fallback) | Mapterhorn attribution page lists its source datasets | "Terrain: Mapterhorn", linked to https://mapterhorn.com/attribution, in the credits strip when terrain is on |

Anyone deploying Waylit supplies their own keys and agrees to the provider terms themselves. Waylit does not ship or share any provider key.

## Assets

Scooter and rider models, icons, sample media and artwork are created for this project and released under the project licence unless an entry below says otherwise. No third party copyrighted assets are included.

| Asset | Source | Licence |
|---|---|---|
| App icons and logo (`apps/web/public/icons/`) | Drawn for this project by `apps/web/scripts/generate-icons.mjs` | Project licence (Apache-2.0) |
| Rotate phone icon (inline SVG in `RotateOverlay`) | Drawn for this project | Project licence (Apache-2.0) |
| Demo route (`packages/core/src/demo-route.ts`) | Original. Hand-placed waypoints in an open public area of Berlin, Germany, with rounded corners. Follows no recorded trace and is not derived from any map, routing service or dataset | Project licence (Apache 2.0) |
| Mock tracks (`packages/core/src/mock-media.ts`) | Original. Invented titles, artists and albums, and short note patterns synthesised at runtime. Any resemblance to a real act or release is coincidence | Project licence (Apache 2.0) |
| Hologram meshes (`packages/map-provider/src/holo-model.ts`) | Original. The kick scooter and rider silhouette, chevron, beacon and heading marker are generated by code. The proportions follow a large kick scooter in general, with no logo, badge or copied design from any manufacturer | Project licence (Apache 2.0) |
| Hologram shaders (`apps/web/src/map/holo-glsl.ts`, `fx-shader.ts`) | Original GLSL written for this project | Project licence (Apache 2.0) |
| Mock cover artwork (`packages/core/src/artwork.ts`) | Original. SVG generated by code from a colour palette and a seed. No image files | Project licence (Apache 2.0) |

### Vehicle protocol reference (MAX G3 Bluetooth adapter)

The Bluetooth adapter adds no dependencies. It uses the browser's own WebCrypto (AES, SHA-1) and Web Bluetooth.

Its protocol facts (service and characteristic numbers, frame layout, the encryption scheme, the three step handshake and the register numbers for the MAX G3) come from one public reference: the Segway-Ninebot BLE Protocol documentation at https://nootnooot.codeberg.page/segway-ninebot-ble/ (pages on transport, frame formats, encryption, authentication, commands and the MAX G3 device page, read in November 2026). Its About page says the documentation and code are released under the Apache License 2.0 and that it is published for interoperability under Article 6 of the EU Software Directive. Waylit credits it as a reference. No code, text or tables were copied from it. The code here was written from the facts only, and the tests use values made up for this repository, plus an independent second implementation of the documented scheme written with node:crypto.

Licence rules for this adapter:

- Write original code from protocol facts only. Never copy, port or translate code from any other project.
- Do not read the source of projects under the GPL or AGPL while working on this adapter. In particular, the miauth project (AGPL-3.0) and py9b (GPL-3.0) are not to be read for code, copied or ported. Their licences would bind Waylit, which is Apache 2.0.
- Do not add real keys, secrets, serial numbers, device addresses or captured traffic anywhere in the repository. The desk simulator uses invented values only.
- Waylit never needs the per vehicle secret that the vendor's cloud issues for commands, and does not send any command that would. See [VEHICLE.md](VEHICLE.md).

### Reference figures

The mock vehicle's figures come from published specifications, which are facts and not copied text or artwork: the manufacturer's product page at https://ap-en.segway.com/product/maxg3.html (battery, range, motor, speed modes) and two independent reviews, https://www.gadgetguy.com.au/max-g3-segway-electric-kickscooter and https://eridehero.com/products/segway-ninebot-max-g3/ (regional speed limit, real-world consumption). They were read on 2026-11-22. Figures differ by region and firmware, so the mock treats them as plausible values. See `packages/vehicle/src/spec.ts`.

## Names and trademarks

Segway, Ninebot, Tesla, Google, Cesium and OpenStreetMap are names of their respective owners. Waylit is not affiliated with or endorsed by any of them. The names appear only to describe vehicle compatibility, data sources or design inspiration. Waylit is not affiliated with Segway. The Segway and Ninebot names are used only to say which vehicle is supported, and no logos or artwork are used.
