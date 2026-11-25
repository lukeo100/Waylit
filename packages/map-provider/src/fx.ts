import { hexToRgb, lightingParameters, mixHex, type Rgb, type ScenePalette } from "./lighting";
import { readQuery } from "./query";
import { StepDownGovernor, type StepGovernorOptions } from "./step-governor";
import type { ProviderId, SceneLighting } from "./types";

/**
 * The futuristic look of the 3D scene, as plain numbers with no renderer.
 *
 * Two things use these numbers. On the CesiumJS path a single full screen post process pass
 * turns them into a colour grade, a cyan edge glow, a horizon haze, a vignette and a very faint
 * scanline shimmer (see `apps/web/src/map/fx-shader.ts`). On the MapLibre fallback the same
 * numbers grade the style colours, which needs no shader at all (`gradePalette`).
 *
 * Everything is driven by the daylight state: a cooler and cleaner grade by day, a warm magenta
 * to cyan split tone at sunset, deep blue with glowing cyan edges at night. Nothing here reads
 * heights, depth or geometry. The only input the shader has is the colour of the picture it is
 * given (see the terms note in docs/ARCHITECTURE.md).
 */

/** How much work the effect does. `off` draws nothing extra. */
export type FxLevel = "off" | "low" | "high";

export const FX_LEVELS: readonly FxLevel[] = ["off", "low", "high"];

/** The next cheaper level, or undefined when already off. */
export function cheaperLevel(level: FxLevel): FxLevel | undefined {
  if (level === "high") return "low";
  if (level === "low") return "off";
  return undefined;
}

/**
 * Google Photorealistic 3D Tiles are only graded when this is true or the address asks for it
 * (`?fx=low` or `?fx=high`). It is false because the effect alters the look of the Google tiles
 * and the Google terms could not be read when it was built (see docs/ARCHITECTURE.md, "Visual
 * effects and the Google terms"). The maintainer can switch it on here after reading them. The
 * fallback map is not Google content and always follows the adaptive default.
 */
export const GOOGLE_FX_ON_BY_DEFAULT = false;

/** Parses an effect level word, or undefined for anything else. */
export function parseFxLevel(value: string | null | undefined): FxLevel | undefined {
  const word = value?.trim().toLowerCase();
  return word === "off" || word === "low" || word === "high" ? word : undefined;
}

/**
 * The level a provider starts at. `?fx=off`, `?fx=low` and `?fx=high` always win, then the
 * rider's own choice from the settings sheet (`stored`), then the default for the provider.
 */
export function resolveFxLevel(search: string, provider: ProviderId, stored?: FxLevel): FxLevel {
  const value = readQuery(search).get("fx")?.trim().toLowerCase();
  if (value === "off" || value === "low" || value === "high") return value;
  if (stored !== undefined) return stored;
  if (provider === "cesium-google") return GOOGLE_FX_ON_BY_DEFAULT ? "high" : "off";
  return "high";
}

/**
 * True when the address or the rider explicitly picked a level, so the adaptive governor must
 * not move it.
 */
export function fxLevelIsPinned(search: string, stored?: FxLevel): boolean {
  return parseFxLevel(readQuery(search).get("fx")) !== undefined || stored !== undefined;
}

/** True when the address picked the level, so the settings sheet cannot change it. */
export function fxLevelIsFromAddress(search: string): boolean {
  return parseFxLevel(readQuery(search).get("fx")) !== undefined;
}

/** Everything the post process and the fallback grade need, all numbers in 0 to 1 unless noted. */
export interface FxParameters {
  readonly level: FxLevel;
  /** 0 for off, 1 for the cheap variant, 2 for the full one. Picks the shader variant. */
  readonly variant: 0 | 1 | 2;
  /** Overall strength of the colour grade, 0 (none) to 1. */
  readonly gradeMix: number;
  /** 1 is unchanged, lower is less saturated. */
  readonly saturation: number;
  /** 1 is unchanged, above 1 adds contrast around mid grey. */
  readonly contrast: number;
  /** Colour added in the darks (deep navy, or magenta at sunset). */
  readonly shadowTone: Rgb;
  /** Colour multiplied in the lights (cool white by day, cyan at sunset). */
  readonly highlightTone: Rgb;
  /** Cyan edge glow colour. */
  readonly edgeColour: Rgb;
  /** Edge glow strength. Strongest at night. */
  readonly edgeStrength: number;
  /** Multiplies the edge signal, because the night picture is dark and its edges are faint. */
  readonly edgeGain: number;
  /** Edge signal below this is ignored, so photographic noise does not shimmer. */
  readonly edgeThreshold: number;
  /** How many texture reads the edge detector makes besides the pixel itself: 0, 2 or 8. */
  readonly edgeTaps: 0 | 2 | 8;
  /** Strength of the haze band at the horizon. */
  readonly hazeStrength: number;
  /** The haze colour. */
  readonly hazeColour: Rgb;
  /** Where the horizon sits on the screen, 0 at the bottom to 1 at the top. */
  readonly horizonY: number;
  /** Half height of the haze band as a fraction of the screen. */
  readonly hazeWidth: number;
  /** Darkening toward the screen corners. */
  readonly vignette: number;
  /** Half height of the scan band as a fraction of the screen. */
  readonly scanHalfWidth: number;
  /** How bright the scan band is, from 0 to 1. Strongest at night. */
  readonly scanStrength: number;
  /** How bright the faint ground grid is. Zero except in the full variant. */
  readonly gridStrength: number;
  /** Strength of the faint scanline shimmer. Zero except in the full variant. */
  readonly scanline: number;
  /** Changes only when a rider could see a difference, so repeated updates can be skipped. */
  readonly key: string;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** The cyan accent from the design tokens, as 0 to 1 channels. */
const CYAN: Rgb = hexToRgb("#5fc8e8");

/** Colours of the grade. Deep navy darks and a teal lean, never a second accent. */
const NAVY: Rgb = [0.02, 0.05, 0.11];
const MAGENTA: Rgb = [0.1, 0.025, 0.09];
const COOL_WHITE: Rgb = [0.95, 1.0, 1.03];
const NIGHT_LIGHTS: Rgb = [0.85, 0.97, 1.05];

export const FX_OFF: FxParameters = {
  level: "off",
  variant: 0,
  gradeMix: 0,
  saturation: 1,
  contrast: 1,
  shadowTone: [0, 0, 0],
  highlightTone: [1, 1, 1],
  edgeColour: CYAN,
  edgeStrength: 0,
  edgeGain: 1,
  edgeThreshold: 0,
  edgeTaps: 0,
  hazeStrength: 0,
  hazeColour: [0, 0, 0],
  horizonY: 0.72,
  hazeWidth: 0.12,
  vignette: 0,
  scanHalfWidth: 0.07,
  scanStrength: 0,
  gridStrength: 0,
  scanline: 0,
  key: "off",
};

/** The effect parameters for a daylight state and a level. */
export function fxParameters(lighting: SceneLighting, level: FxLevel): FxParameters {
  if (level === "off") return FX_OFF;
  const high = level === "high";
  const f = clamp01(lighting.daylightFactor);
  const w = clamp01(lighting.warmth);
  const night = 1 - f;
  const sky = lightingParameters(lighting).sky;

  const gradeMix = (high ? 0.85 : 0.6) * lerp(0.75, 1, night);
  const saturation = lerp(0.84, 0.7, night);
  const contrast = lerp(1.07, 1.14, night);

  // Split tone: navy and cool white by day, magenta darks and cyan lights around sunset.
  const shadowTone = mixRgb(NAVY, MAGENTA, w * 0.8);
  const lights = mixRgb(COOL_WHITE, NIGHT_LIGHTS, night);
  const highlightTone = mixRgb(lights, [0.8, 1.0, 1.08], w * 0.5);

  // The edge glow is faint by day, clear at sunset, and the main event at night.
  const edgeStrength = (high ? 1 : 0.7) * lerp(0.1, 0.6, night) * (1 + 0.5 * w);
  const edgeGain = lerp(2.2, 9, night);

  const hazeStrength = lerp(0.16, 0.26, night) * (high ? 1 : 0.8);
  const hazeColour = mixRgb(hexToRgb(sky.horizon), CYAN, 0.12 + 0.2 * night);
  const vignette = lerp(0.2, 0.34, night);

  const parameters: Omit<FxParameters, "key"> = {
    level,
    variant: high ? 2 : 1,
    gradeMix,
    saturation,
    contrast,
    shadowTone,
    highlightTone,
    edgeColour: CYAN,
    edgeStrength,
    edgeGain,
    edgeThreshold: 0.045,
    edgeTaps: high ? 8 : 2,
    hazeStrength,
    hazeColour,
    horizonY: 0.72,
    hazeWidth: 0.12,
    vignette,
    // The holographic scan band and ground grid are quiet by day and clear at night.
    scanHalfWidth: 0.07,
    scanStrength: lerp(0.18, 0.55, night) * (high ? 1 : 0.8),
    gridStrength: high ? lerp(0.05, 0.16, night) : 0,
    scanline: high ? 0.018 : 0,
  };
  const key = [level, Math.round(f * 40), Math.round(w * 20)].join("|");
  return { ...parameters, key };
}

/**
 * The same look for the MapLibre fallback, as a grade of the style colours: deep navy and teal
 * pulled into the palette, slightly less saturated, with roads and building edges lifted toward
 * cyan at night. It changes colours only, so it costs nothing per frame.
 */
export function gradePalette(
  palette: ScenePalette,
  lighting: SceneLighting,
  level: FxLevel,
): ScenePalette {
  if (level === "off") return palette;
  const p = fxParameters(lighting, level);
  const night = 1 - clamp01(lighting.daylightFactor);
  const toTone = (hex: string, amount: number): string => {
    const [r, g, b] = hexToRgb(hex);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const saturated: Rgb = [
      lerp(luma, r, p.saturation),
      lerp(luma, g, p.saturation),
      lerp(luma, b, p.saturation),
    ];
    const toned: Rgb = [
      saturated[0] * lerp(1, p.highlightTone[0], luma) + p.shadowTone[0] * (1 - luma),
      saturated[1] * lerp(1, p.highlightTone[1], luma) + p.shadowTone[1] * (1 - luma),
      saturated[2] * lerp(1, p.highlightTone[2], luma) + p.shadowTone[2] * (1 - luma),
    ];
    const mixed = mixRgb([r, g, b], toned, amount);
    const toHex = (c: number): string =>
      Math.round(clamp01(c) * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(mixed[0])}${toHex(mixed[1])}${toHex(mixed[2])}`;
  };
  const amount = p.gradeMix;
  // Roads and building walls carry the cyan edge glow of the full effect, strongest at night.
  const glow = (hex: string, strength: number): string => mixHex(hex, "#5fc8e8", strength);
  const edge = p.edgeStrength * 0.5 * night;
  return {
    land: toTone(palette.land, amount),
    water: toTone(palette.water, amount),
    park: toTone(palette.park, amount),
    landuse: toTone(palette.landuse, amount),
    roadMinor: glow(toTone(palette.roadMinor, amount), edge * 0.6),
    roadMajor: glow(toTone(palette.roadMajor, amount), edge),
    path: glow(toTone(palette.path, amount), edge * 0.5),
    rail: toTone(palette.rail, amount),
    building: glow(toTone(palette.building, amount), edge * 0.45),
  };
}

/**
 * Chooses the effect level from measured frame rate. It starts at the level it is given and
 * only ever steps down (high, then low, then off) when the median frame rate since the last
 * change is below 30 fps, so a phone that cannot keep up stops paying for the effect. It never
 * steps back up, which keeps it from flipping. See `StepDownGovernor`.
 */
export class FxGovernor extends StepDownGovernor<FxLevel> {
  constructor(initial: FxLevel, options: StepGovernorOptions = {}) {
    super(initial, cheaperLevel, options);
  }
}
