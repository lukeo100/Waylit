import {
  DEMO_ROUTE_GROUND_ELLIPSOID_METRES,
  constantGroundHeight,
  type MapProvider,
  type ProviderId,
  type RenderTuning,
  type SceneLighting,
} from "@waylit/map-provider";

/**
 * Loads a provider on demand. Both providers sit behind dynamic imports, so the start screen
 * and the home page do not carry CesiumJS or MapLibre. Each import is its own chunk, and only
 * the one that is used is fetched.
 */
export async function loadProvider(
  id: ProviderId,
  tuning: RenderTuning,
  context: { readonly token: string | undefined; readonly lighting: SceneLighting | undefined },
): Promise<MapProvider> {
  if (id === "cesium-google") {
    if (!context.token) throw new Error("no token");
    const { CesiumGoogleProvider } = await import("./cesium-google");
    return new CesiumGoogleProvider({
      token: context.token,
      tuning,
      ground: constantGroundHeight(
        tuning.groundHeightEllipsoidMetres ?? DEMO_ROUTE_GROUND_ELLIPSOID_METRES,
      ),
    });
  }
  const { MapLibreFallbackProvider } = await import("./maplibre-fallback");
  return new MapLibreFallbackProvider({ tuning, initialLighting: context.lighting });
}
