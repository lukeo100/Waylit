import { readQuery } from "./query";
import type { ProviderId } from "./types";

/**
 * Which provider to run, and how hard it may work. Pure functions of the address, the build
 * mode and the token, so they can be tested and so the app and any later native app agree.
 */

/** The value of `?map=` in the address, if it is one the app knows. */
export type MapChoice = "cesium" | "fallback";

export function parseMapChoice(search: string): MapChoice | undefined {
  const value = readQuery(search).get("map")?.trim().toLowerCase();
  return value === "cesium" || value === "fallback" ? value : undefined;
}

export type SelectionReason =
  /** `?map=fallback` in the address. */
  | "override-fallback"
  /** `?map=cesium` in the address and a token is configured. */
  | "override-cesium"
  /** `?map=cesium` in the address but no token is configured, so the fallback runs. */
  | "override-cesium-no-token"
  /** No token is configured. */
  | "no-token"
  /** A development build defaults to the fallback so hot reloads do not use the allowance. */
  | "development-default"
  /** A token is configured and this is a production build. */
  | "token";

export interface ProviderSelection {
  readonly id: ProviderId;
  readonly reason: SelectionReason;
}

export interface SelectProviderInput {
  /** The address query string, such as `?map=cesium`. */
  readonly search: string;
  /** The Cesium ion token, if the deployer set one. Blank counts as none. */
  readonly token: string | undefined;
  /** `process.env.NODE_ENV`. Anything other than "production" is a development build. */
  readonly nodeEnv: string | undefined;
}

/**
 * Picks the provider. CesiumJS with Google Photorealistic 3D Tiles needs a Cesium ion token, so
 * without one the fallback runs. Development builds default to the fallback unless the address
 * has `?map=cesium`, because every Cesium page load can use one of the monthly root tileset
 * requests (the free allowance is small). `?map=fallback` forces the fallback anywhere.
 */
export function selectProvider(input: SelectProviderInput): ProviderSelection {
  const hasToken = (input.token?.trim() ?? "") !== "";
  const choice = parseMapChoice(input.search);
  if (choice === "fallback") return { id: "maplibre-fallback", reason: "override-fallback" };
  if (choice === "cesium") {
    return hasToken
      ? { id: "cesium-google", reason: "override-cesium" }
      : { id: "maplibre-fallback", reason: "override-cesium-no-token" };
  }
  if (!hasToken) return { id: "maplibre-fallback", reason: "no-token" };
  if (input.nodeEnv !== "production") {
    return { id: "maplibre-fallback", reason: "development-default" };
  }
  return { id: "cesium-google", reason: "token" };
}

/** Tuning for one provider. Defaults are a starting point for a mid range phone. */
export interface RenderTuning {
  /** The most device pixels per CSS pixel to render. Phones report 2.5 to 3.5. */
  readonly pixelRatioCap: number;
  /** Frame rate cap while riding. */
  readonly ridingFps: number;
  /** Frame rate cap on the start screen, before the trip begins. */
  readonly idleFps: number;
  /** CesiumJS: higher means coarser tiles and less work. */
  readonly maximumScreenSpaceError: number;
  /** CesiumJS: tile cache in bytes. */
  readonly cacheBytes: number;
  /** CesiumJS: extra bytes allowed over the cache while tiles are in use. */
  readonly maximumCacheOverflowBytes: number;
  /** CesiumJS: simultaneous requests to the tile host (Google suggests 18). */
  readonly maximumRequestsPerServer: number;
  /** MapLibre: show open terrain. */
  readonly terrain: boolean;
  /** Draw a small debug marker at the rider. */
  readonly debugMarker: boolean;
  /**
   * Height of the ground above the WGS84 ellipsoid at the route, in metres, for providers that
   * must not read heights from their own content. Undefined means use the route's own value.
   */
  readonly groundHeightEllipsoidMetres: number | undefined;
}

const MIB = 1024 * 1024;

export const DEFAULT_TUNING: Readonly<Record<ProviderId, RenderTuning>> = {
  "cesium-google": {
    pixelRatioCap: 1.5,
    ridingFps: 30,
    idleFps: 10,
    maximumScreenSpaceError: 32,
    cacheBytes: 256 * MIB,
    maximumCacheOverflowBytes: 128 * MIB,
    maximumRequestsPerServer: 18,
    terrain: false,
    debugMarker: false,
    groundHeightEllipsoidMetres: undefined,
  },
  "maplibre-fallback": {
    pixelRatioCap: 2,
    ridingFps: 30,
    idleFps: 10,
    maximumScreenSpaceError: 0,
    cacheBytes: 0,
    maximumCacheOverflowBytes: 0,
    maximumRequestsPerServer: 6,
    terrain: true,
    debugMarker: false,
    groundHeightEllipsoidMetres: undefined,
  },
};

function numberParam(
  params: ReadonlyMap<string, string>,
  name: string,
  min: number,
  max: number,
): number | undefined {
  const raw = params.get(name);
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

/**
 * The tuning for a provider. When `allowOverrides` is true (development builds and `?dev=1`),
 * the address can adjust it for testing on a device: `sse` (screen space error, 4 to 128),
 * `dpr` (pixel ratio cap, 0.5 to 3), `fps` (5 to 60), `ground` (ground height above the
 * ellipsoid in metres, -100 to 3000), `terrain` (0 or 1) and `marker` (1). Values are clamped,
 * and anything that is not a number is ignored.
 */
export function resolveTuning(
  id: ProviderId,
  search: string,
  allowOverrides: boolean,
): RenderTuning {
  const base = DEFAULT_TUNING[id];
  if (!allowOverrides) return base;
  const params = readQuery(search);
  const sse = numberParam(params, "sse", 4, 128);
  const dpr = numberParam(params, "dpr", 0.5, 3);
  const fps = numberParam(params, "fps", 5, 60);
  const ground = numberParam(params, "ground", -100, 3000);
  const terrain = params.get("terrain");
  return {
    ...base,
    pixelRatioCap: dpr ?? base.pixelRatioCap,
    ridingFps: fps ?? base.ridingFps,
    maximumScreenSpaceError: sse ?? base.maximumScreenSpaceError,
    terrain: terrain === "0" ? false : terrain === "1" ? true : base.terrain,
    debugMarker: params.get("marker") === "1",
    groundHeightEllipsoidMetres: ground ?? base.groundHeightEllipsoidMetres,
  };
}

/** The device pixel ratio to render at: the device's own, never above the cap, never below 0.5. */
export function effectivePixelRatio(devicePixelRatio: number, cap: number): number {
  const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.max(0.5, Math.min(device, cap));
}
