import { Cartesian3 } from "@cesium/core";
import { CustomShader, LightingModel, UniformType } from "@cesium/engine";
import type { FxLevel } from "@waylit/map-provider";

/**
 * The night tint for the photographic tiles, as an unlit custom shader.
 *
 * It recolours the tile imagery (a multiply by a tint, plus a faint warm lift on the brightest
 * surfaces), so it belongs to the visual effect setting: it is created only when the effect is
 * on. In Google mode the effect is off by default (`GOOGLE_FX_ON_BY_DEFAULT`, `?fx=off`), and
 * then no custom shader exists and the tiles are drawn as Google supplies them. See
 * docs/ARCHITECTURE.md, "Visual effects and the Google terms".
 *
 * Colour only, from the tile's own colour. Nothing about shape, height or depth.
 */

/** True when the tile shader may exist at this level. Off means the tiles are never recoloured. */
export function tileShaderWanted(level: FxLevel): boolean {
  return level !== "off";
}

/** The fragment shader text. Exported for tests. */
export const TILE_SHADER_FRAGMENT = `
  void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
    vec3 photo = material.diffuse;
    float bright = dot(photo, vec3(0.2126, 0.7152, 0.0722));
    material.diffuse = photo * u_tint + u_lamp * bright * bright * bright;
  }`;

/** Makes the tile shader, or returns undefined when the effect is off. */
export function createTileShader(level: FxLevel): CustomShader | undefined {
  if (!tileShaderWanted(level)) return undefined;
  return new CustomShader({
    lightingModel: LightingModel.UNLIT,
    uniforms: {
      u_tint: { type: UniformType.VEC3, value: new Cartesian3(1, 1, 1) },
      // A faint warm lift on the brightest surfaces at night (pale roads and walls), so the dark
      // scene keeps a street light feel. Zero by day.
      u_lamp: { type: UniformType.VEC3, value: new Cartesian3(0, 0, 0) },
    },
    fragmentShaderText: TILE_SHADER_FRAGMENT,
  });
}

/** Sets the tint and the warm lift for the current daylight. */
export function setTileShaderLighting(
  shader: CustomShader,
  tint: readonly [number, number, number],
  daylightFactor: number,
): void {
  shader.setUniform("u_tint", new Cartesian3(tint[0], tint[1], tint[2]));
  // Warm street light lift, only once it is properly dark.
  const night = (1 - Math.min(1, Math.max(0, daylightFactor))) ** 2;
  shader.setUniform("u_lamp", new Cartesian3(0.62 * night, 0.44 * night, 0.21 * night));
}
