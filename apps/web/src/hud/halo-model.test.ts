import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shadow } from "@waylit/ui-tokens";
import {
  GLYPH_TEXT,
  SCENE_ICON_SHADOW,
  SCENE_TEXT_SHADOW,
  contrastRatio,
  glyphBackdrop,
  hexRgb,
  type Rgb,
} from "./readability";

/**
 * The layout check (`apps/web/scripts/layout-check.mjs`) runs its own copy of the shadow model in
 * the page, from `scripts/halo-model.mjs`, because it cannot import TypeScript. This test keeps
 * the two copies in step: same parsing of the computed values Chrome reports, same contrast.
 */
const modelPath = fileURLToPath(new URL("../../scripts/halo-model.mjs", import.meta.url));
const { haloContrast, parseShadowLayers } = (await import(modelPath)) as {
  haloContrast: (fg: Rgb, scene: Rgb, layers: unknown, stroke: number, probe?: number) => number;
  parseShadowLayers: (value: string) => { x: number; y: number; blur: number; alpha: number }[];
};

describe("the layout check's shadow model matches readability.ts", () => {
  const SCENES: Rgb[] = [
    [255, 255, 255],
    [188, 217, 238],
    [232, 228, 216],
    [16, 21, 29],
    [0, 0, 0],
  ];

  it("reads the token strings and Chrome's computed form into the same layers", () => {
    const computedText =
      "rgba(0, 0, 0, 0.72) 1px 0px 0px, rgba(0, 0, 0, 0.72) -1px 0px 0px, rgba(0, 0, 0, 0.72) 0px 1px 0px, rgba(0, 0, 0, 0.72) 0px -1px 0px, rgba(0, 0, 0, 0.55) 0px 0px 8px";
    const computedIcon = computedText
      .split(/,(?![^(]*\))/)
      .map((layer) => `drop-shadow(${layer.trim()})`)
      .join(" ");
    expect(parseShadowLayers(shadow.scene)).toEqual([...SCENE_TEXT_SHADOW]);
    expect(parseShadowLayers(computedText)).toEqual([...SCENE_TEXT_SHADOW]);
    expect(parseShadowLayers(computedIcon)).toEqual([...SCENE_ICON_SHADOW]);
    expect(parseShadowLayers(shadow.sceneIcon)).toEqual([...SCENE_ICON_SHADOW]);
  });

  it("gives the same contrast for every text, scene and shadow", () => {
    for (const text of GLYPH_TEXT) {
      for (const scene of SCENES) {
        const typed = contrastRatio(
          hexRgb(text.hex),
          glyphBackdrop(scene, SCENE_TEXT_SHADOW, text.stroke),
        );
        const page = haloContrast(
          [...hexRgb(text.hex)] as unknown as Rgb,
          scene,
          SCENE_TEXT_SHADOW,
          text.stroke,
        );
        expect(page).toBeCloseTo(typed, 9);
      }
    }
  });
});
