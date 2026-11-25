/**
 * Copies the static files the two map renderers load at run time into apps/web/public, so
 * Next.js serves them from the app's own address:
 *
 *   public/cesium/    CesiumJS web workers, WebAssembly, images and widget styles, from
 *                     @cesium/engine. The app sets CESIUM_BASE_URL to /cesium/ before it loads
 *                     Cesium (see src/map/cesium-setup.ts).
 *   public/maplibre/  The MapLibre GL JS worker script, from maplibre-gl. The bundler cannot
 *                     find it by itself, so the app passes its address to setWorkerUrl
 *                     (see src/map/maplibre-fallback.ts).
 *
 * It runs before `next dev` and `next build` (see package.json). A copy is skipped when the
 * folder already matches the installed version. Both output folders are ignored by git.
 *
 * Dependency free: Node.js built-ins only.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
const require = createRequire(import.meta.url);

/** Copies `entries` (names inside `sourceRoot`) to public/<name>, unless it is current. */
function copyInto({ name, packageName, sourceRoot, entries }) {
  const manifest = require.resolve(`${packageName}/package.json`);
  const version = JSON.parse(readFileSync(manifest, "utf8")).version;
  const root = join(dirname(manifest), sourceRoot);
  const target = join(publicDir, name);
  const stamp = join(target, ".version");

  const upToDate =
    existsSync(stamp) &&
    readFileSync(stamp, "utf8").trim() === version &&
    entries.every((entry) => existsSync(join(target, entry.to)));
  if (upToDate) {
    console.log(`${name} assets already at ${version}`);
    return;
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const entry of entries) {
    cpSync(join(root, entry.from), join(target, entry.to), { recursive: true });
  }
  writeFileSync(stamp, `${version}\n`);
  console.log(`Copied ${packageName} ${version} assets to public/${name}`);
}

// CESIUM_BASE_URL must contain these four folders.
copyInto({
  name: "cesium",
  packageName: "@cesium/engine",
  sourceRoot: "Build",
  entries: ["Assets", "ThirdParty", "Widgets", "Workers"].map((folder) => ({
    from: folder,
    to: folder,
  })),
});

copyInto({
  name: "maplibre",
  packageName: "maplibre-gl",
  sourceRoot: "dist",
  entries: [{ from: "maplibre-gl-worker.mjs", to: "maplibre-gl-worker.mjs" }],
});
