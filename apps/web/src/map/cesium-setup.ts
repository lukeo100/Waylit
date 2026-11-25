/**
 * Tells CesiumJS where its static files are. They are copied to `public/cesium` before every
 * dev start and build (see scripts/copy-cesium-assets.mjs), so they are served from `/cesium/`.
 * Cesium reads `CESIUM_BASE_URL` when it first needs a worker, a WebAssembly file or an image,
 * so this must run before the widget is created.
 */
export const CESIUM_BASE_PATH = "/cesium/";

export function setCesiumBaseUrl(): void {
  (globalThis as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = CESIUM_BASE_PATH;
}
