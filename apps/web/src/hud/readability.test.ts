import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lightingParameters, hexToRgb } from "@waylit/map-provider";
import { color } from "@waylit/ui-tokens";
import {
  EDGE_PROBE_PX,
  GLYPH_TEXT,
  PLATE_RGB,
  SCENE_ICON_SHADOW,
  SCENE_TEXT,
  SCENE_TEXT_SHADOW,
  behindPlate,
  composite,
  contrastRatio,
  glyphBackdrop,
  hexRgb,
  parseDropShadows,
  parseTextShadow,
  plateAlpha,
  type Rgb,
  type ShadowLayer,
} from "./readability";

/**
 * WCAG contrast of the HUD over the 3D scene. There is no screen wide scrim. The top left
 * navigation text and the top right status text have no plate: they carry a shadow that follows
 * the glyphs (`shadow.scene`), checked in "glyph shadow with no plate" below. The few remaining
 * groups of text over the scene sit on a small plate of dark glass (`.wl-plate`), and the dock on
 * its own glass. So the plate check is: for every daylight factor, every worst case scene colour
 * right behind the plate, and every text colour allowed on it, small text reaches 4.5:1 and large
 * text 3:1.
 *
 * The scene samples are the scene's own colours (the day palette and sky from
 * `lightingParameters` at noon, which is what the fallback map draws and the Cesium sky is tinted
 * toward), the night palette and the cyan hologram, a pale sunlit photographic ground (#e8e4d8,
 * an assumed worst case, not measured on a real Google tile screenshot), and pure white, which is
 * brighter than anything the scene can draw. Every sample is checked at every daylight factor,
 * because a bright surface can be on screen at night too (a lit facade, the beacon).
 */

const toRgb255 = (hex: string): Rgb => {
  const [r, g, b] = hexToRgb(hex);
  return [r * 255, g * 255, b * 255];
};

const lighting = (daylightFactor: number, elevation: number) =>
  lightingParameters({
    timestamp: 0,
    position: { lat: 52.47, lng: 13.4 },
    sunElevationDegrees: elevation,
    sunAzimuthDegrees: 180,
    phase: daylightFactor > 0.5 ? "day" : "night",
    daylightFactor,
    warmth: 0,
  });
const noon = lighting(1, 40);
const night = lighting(0, -40);

const SCENE: Record<string, Rgb> = {
  "pure white": [255, 255, 255],
  "sunlit photographic ground": [232, 228, 216],
  "day sky horizon": toRgb255(noon.sky.horizon),
  "day sky zenith": toRgb255(noon.sky.zenith),
  "sunlit land": toRgb255(noon.palette.land),
  "pale road": toRgb255(noon.palette.roadMajor),
  "pale building": toRgb255(noon.palette.building),
  "bright hologram cyan": hexRgb("#67e8f9"),
  "night horizon": toRgb255(night.sky.horizon),
  "night ground": toRgb255(night.palette.land),
  black: [0, 0, 0],
};

const DAYLIGHT = [0, 0.25, 0.5, 0.75, 1];

describe("HUD text on its plate over the scene", () => {
  for (const daylight of DAYLIGHT) {
    for (const [sceneName, scene] of Object.entries(SCENE)) {
      for (const text of SCENE_TEXT) {
        it(`${text.role} over ${sceneName} at daylight ${daylight}`, () => {
          const ratio = contrastRatio(hexRgb(text.hex), behindPlate(scene, daylight));
          expect(ratio).toBeGreaterThanOrEqual(text.large ? 3 : 4.5);
        });
      }
    }
  }

  it("is a little more solid in daylight, and never fully opaque", () => {
    expect(plateAlpha(1)).toBeGreaterThan(plateAlpha(0));
    expect(plateAlpha(0.5)).toBeGreaterThan(plateAlpha(0));
    expect(plateAlpha(1)).toBeLessThan(0.9);
    expect(plateAlpha(-1)).toBe(plateAlpha(0));
    expect(plateAlpha(2)).toBe(plateAlpha(1));
  });

  it("would fail without the plate, so the check means something", () => {
    // Bare secondary text on pure white is far below AA.
    expect(contrastRatio(hexRgb(color.textSecondary), [255, 255, 255])).toBeLessThan(2);
  });

  it("matches the CSS: .wl-plate blends the same colour with the same tokens", () => {
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
    const rule = /\.wl-plate\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("var(--wl-plate-night)");
    expect(rule).toContain("var(--wl-plate-day)");
    expect(rule).toContain("var(--wl-daylight, 0)");
    expect(rule).toContain(`rgb(${PLATE_RGB.join(" ")} / var(--wl-plate-alpha))`);
    expect(rule).not.toMatch(/gradient|blur|filter/);
  });
});

describe("glyph shadow with no plate (top left navigation, top right status)", () => {
  /**
   * The model (see `glyphBackdrop`): an isolated stroke as wide as the thinnest stroke of that
   * text, the pixel touching its edge, the worst of the four sides, the shadow's black composited
   * in sRGB. Pure white is the worst case, a white sky or a white road in full sun.
   */
  const SHADOWS: Record<string, readonly ShadowLayer[]> = {
    "text shadow": SCENE_TEXT_SHADOW,
    "icon drop shadow": SCENE_ICON_SHADOW,
  };
  for (const [shadowName, layers] of Object.entries(SHADOWS)) {
    for (const [sceneName, scene] of Object.entries(SCENE)) {
      for (const text of GLYPH_TEXT) {
        it(`${text.role} with the ${shadowName} over ${sceneName}`, () => {
          const ratio = contrastRatio(hexRgb(text.hex), glyphBackdrop(scene, layers, text.stroke));
          expect(ratio).toBeGreaterThanOrEqual(text.large ? 3 : 4.5);
        });
      }
    }
  }

  it("never lowers contrast on a dark scene, where the shadow cannot help", () => {
    for (const scene of [SCENE["night horizon"], SCENE["night ground"], SCENE.black] as Rgb[]) {
      for (const text of GLYPH_TEXT) {
        const bare = contrastRatio(hexRgb(text.hex), scene);
        const shadowed = contrastRatio(
          hexRgb(text.hex),
          glyphBackdrop(scene, SCENE_TEXT_SHADOW, text.stroke),
        );
        expect(shadowed).toBeGreaterThanOrEqual(bare - 1e-9);
        expect(bare).toBeGreaterThan(8);
      }
    }
  });

  it("is the same shadow as text and as an icon filter", () => {
    expect(SCENE_ICON_SHADOW).toEqual(SCENE_TEXT_SHADOW);
    expect(SCENE_TEXT_SHADOW.length).toBeGreaterThanOrEqual(5);
  });

  it("would fail with only a soft halo, so the 1 pixel edge is needed (pure white)", () => {
    // The first draft: a 1 pixel close shadow and a soft 8 pixel halo, 0.65 and 0.55 opaque.
    const soft = parseTextShadow("0 1px 1px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 0, 0, 0.55)");
    const white: Rgb = [255, 255, 255];
    for (const text of GLYPH_TEXT) {
      const ratio = contrastRatio(hexRgb(text.hex), glyphBackdrop(white, soft, text.stroke));
      expect(ratio, text.role).toBeLessThan(text.large ? 3 : 4.5);
    }
    // And with the edge, the same text passes (checked for every text above).
    expect(SCENE_TEXT_SHADOW.some((layer) => layer.blur === 0)).toBe(true);
  });

  it("looks only at the pixel touching the glyph, at most 1 pixel out", () => {
    expect(EDGE_PROBE_PX).toBeGreaterThan(0);
    expect(EDGE_PROBE_PX).toBeLessThanOrEqual(1);
    // A hard 1 pixel edge covers that pixel on all four sides at any stroke width.
    for (const stroke of [1, 2.4, 6]) {
      const behind = glyphBackdrop([255, 255, 255], SCENE_TEXT_SHADOW, stroke);
      expect(behind[0]).toBeLessThan(255 * 0.5);
    }
  });

  it("parses Chrome's computed order (colour first) the same as the token order", () => {
    const authored = parseTextShadow("1px 0 0 rgba(0, 0, 0, 0.72), 0 0 8px rgba(0, 0, 0, 0.55)");
    const computed = parseTextShadow(
      "rgba(0, 0, 0, 0.72) 1px 0px 0px, rgba(0, 0, 0, 0.55) 0px 0px 8px",
    );
    expect(computed).toEqual(authored);
    expect(
      parseDropShadows(
        "drop-shadow(rgba(0, 0, 0, 0.72) 1px 0px 0px) drop-shadow(rgba(0, 0, 0, 0.55) 0px 0px 8px)",
      ),
    ).toEqual(authored);
  });

  it("matches the CSS: .wl-hud-shadow and .wl-hud-icon use the tokens and paint no box", () => {
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
    const text = /\.wl-hud-shadow\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const icon = /\.wl-hud-icon\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(text).toContain("text-shadow: var(--wl-shadow-scene)");
    expect(icon).toContain("filter: var(--wl-shadow-scene-icon)");
    for (const rule of [text, icon]) {
      expect(rule).not.toMatch(/background|border|box-shadow|backdrop-filter|gradient/);
    }
  });
});

describe("dock text on its glass over the scene", () => {
  const alpha = (rgba: string): number => Number(/,\s*([0-9.]+)\)$/.exec(rgba)?.[1]);
  const fill: Rgb = [10, 13, 18];
  const DOCK_TEXT = [
    { role: "values", hex: color.text },
    { role: "artist and units", hex: color.textSecondary },
    { role: "labels", hex: color.textMuted },
    { role: "low battery", hex: color.caution },
  ];
  for (const [glassName, glass] of [
    ["night glass", color.glassNight],
    ["day glass", color.glassDay],
  ] as const) {
    for (const [sceneName, scene] of Object.entries(SCENE)) {
      for (const text of DOCK_TEXT) {
        it(`${text.role} on ${glassName} over ${sceneName}`, () => {
          const behind = composite(scene, fill, alpha(glass));
          expect(contrastRatio(hexRgb(text.hex), behind)).toBeGreaterThanOrEqual(4.5);
        });
      }
      it(`End trip on its red fill on ${glassName} over ${sceneName}`, () => {
        const red: Rgb = [96, 22, 30];
        const behind = composite(
          composite(scene, fill, alpha(glass)),
          red,
          alpha(color.dangerFill),
        );
        expect(contrastRatio(hexRgb(color.danger), behind)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
