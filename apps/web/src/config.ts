/**
 * Public, build-time configuration. Every value has a working default, so the app
 * runs with no environment variables at all.
 */

/** Upstream source repository. Forks can point this at their own copy. */
const DEFAULT_SOURCE_URL = "https://github.com/lukeo100/Waylit";

export const sourceUrl: string = process.env.NEXT_PUBLIC_WAYLIT_SOURCE_URL || DEFAULT_SOURCE_URL;

/**
 * Cesium ion access token for the photorealistic map. Empty means the app uses the fallback
 * map. It is inlined into the browser bundle at build time, so it is visible to anyone who
 * opens the app: use a token that has only the `assets:read` scope, is limited to the one
 * asset and is restricted to your site's address (see docs/DEPLOYING.md). Never log it.
 */
export const cesiumIonToken: string | undefined =
  process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN?.trim() || undefined;
