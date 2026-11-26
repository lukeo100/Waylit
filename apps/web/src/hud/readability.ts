import { color, plate, shadow } from "@waylit/ui-tokens";

/**
 * How the HUD stays readable over the 3D scene without darkening it.
 *
 * There is no full screen scrim, gradient or vignette. Two kinds of local aid are used:
 *
 * 1. The top left navigation text and the top right status text have no plate at all. They carry
 *    a shadow that follows the glyphs only (`shadow.scene` for text, `shadow.sceneIcon` for icons),
 *    modelled below by `glyphBackdrop`.
 * 2. The few other groups of text over the scene (the start caption, the map note, the map
 *    settings button) sit on a small plate of dark glass. The plate's opacity follows the daylight
 *    factor, and its floor is chosen so that every text colour allowed on a plate passes WCAG AA
 *    over pure white. The CSS class `.wl-plate` uses the same tokens.
 *
 * `readability.test.ts` checks the numbers for both.
 */

export type Rgb = readonly [number, number, number];

/** The plate colour, the `night950` token as 0 to 255 channels. */
export const PLATE_RGB: Rgb = hexRgb(color.night950);

/** The plate's opacity for a daylight factor from 0 (dark) to 1 (full day). */
export function plateAlpha(daylight: number): number {
  const d = Math.min(1, Math.max(0, daylight));
  return Number(plate.night) + (Number(plate.day) - Number(plate.night)) * d;
}

/** Parses `#rrggbb` into 0 to 255 channels. */
export function hexRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const linear = (channel: number): number => {
  const v = channel / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2 relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `over` drawn at `alpha` on top of `under`, the way a browser blends in sRGB. */
export function composite(under: Rgb, over: Rgb, alpha: number): Rgb {
  return [
    under[0] * (1 - alpha) + over[0] * alpha,
    under[1] * (1 - alpha) + over[1] * alpha,
    under[2] * (1 - alpha) + over[2] * alpha,
  ];
}

/** What the rider sees behind text on a plate, for a scene colour and a daylight factor. */
export function behindPlate(scene: Rgb, daylight: number): Rgb {
  return composite(scene, PLATE_RGB, plateAlpha(daylight));
}

/**
 * Every text colour that may sit on a plate over the scene (the start caption, the map note, the
 * map settings icon), with its WCAG size class. The navigation and status text no longer sit on
 * a plate, see `GLYPH_TEXT` below. `textMuted` is not on the list: muted grey is for panels such
 * as the dock, never for text over the scene.
 */
export const SCENE_TEXT: readonly {
  readonly role: string;
  readonly hex: string;
  readonly large: boolean;
}[] = [
  { role: "primary text", hex: color.text, large: false },
  { role: "secondary text", hex: color.textSecondary, large: false },
  { role: "amber label and note", hex: color.caution, large: false },
  { role: "cyan accent", hex: color.cyan, large: false },
];

/**
 * One layer of a shadow: offset, blur radius (the CSS blur radius, so the Gaussian sigma is half
 * of it), and the opacity of its black.
 */
export interface ShadowLayer {
  readonly x: number;
  readonly y: number;
  readonly blur: number;
  readonly alpha: number;
}

/** Splits a list on commas that are not inside brackets. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((part) => part.trim()).filter(Boolean);
}

/** One layer such as `1px 0 0 rgba(0, 0, 0, 0.72)` (the colour may also come first). */
function layerFrom(text: string): ShadowLayer | undefined {
  const colour = /rgba?\(([^)]*)\)/.exec(text);
  if (!colour) return undefined;
  const lengths = text
    .replace(colour[0], " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => Number.parseFloat(part));
  const channels = (colour[1] ?? "")
    .split(/[ ,/]+/)
    .filter(Boolean)
    .map(Number);
  if (lengths.length < 3 || lengths.some((n) => !Number.isFinite(n))) return undefined;
  return {
    x: lengths[0] ?? 0,
    y: lengths[1] ?? 0,
    blur: lengths[2] ?? 0,
    alpha: channels.length > 3 ? (channels[3] ?? 1) : 1,
  };
}

function isLayer(layer: ShadowLayer | undefined): layer is ShadowLayer {
  return layer !== undefined;
}

/** The layers of a `text-shadow` value such as `shadow.scene`. */
export function parseTextShadow(value: string): ShadowLayer[] {
  return splitTopLevel(value).map(layerFrom).filter(isLayer);
}

/** The layers of a chain of `drop-shadow()` filters such as `shadow.sceneIcon`. */
export function parseDropShadows(filter: string): ShadowLayer[] {
  return [...filter.matchAll(/drop-shadow\(((?:[^()]|\([^)]*\))*)\)/g)]
    .map((m) => layerFrom(m[1] ?? ""))
    .filter(isLayer);
}

/** The shadow on text with no plate, and the same shadow as a filter for icons. */
export const SCENE_TEXT_SHADOW: readonly ShadowLayer[] = parseTextShadow(shadow.scene);
export const SCENE_ICON_SHADOW: readonly ShadowLayer[] = parseDropShadows(shadow.sceneIcon);

/** How far outside a glyph's edge the model looks: the pixel touching it. */
export const EDGE_PROBE_PX = 0.5;

/** Cumulative standard normal distribution, to 1e-7 (Abramowitz and Stegun 7.1.26). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

/**
 * How much of one shadow layer lands on the pixel `probe` pixels outside the edge of a glyph
 * stroke `stroke` pixels wide, probing in the direction `dir` (a unit step). The stroke is a
 * one dimensional bar of that width, its shadow is the bar moved by the layer's offset and
 * blurred by a Gaussian of sigma blur / 2. Coverage is 1 where the shadow is solid. A layer with
 * no blur is a hard edged copy of the bar.
 */
function layerCoverage(
  layer: ShadowLayer,
  stroke: number,
  probe: number,
  dir: readonly [number, number],
): number {
  const half = stroke / 2;
  // Distance of the probe from the centre of the shadowed bar, along the probe direction.
  const d = half + probe - (dir[0] * layer.x + dir[1] * layer.y);
  const sigma = layer.blur / 2;
  if (sigma === 0) return Math.abs(d) <= half ? 1 : 0;
  return normalCdf((half - d) / sigma) + normalCdf((half + d) / sigma) - 1;
}

/** Opacity of the black from all layers on the probe pixel, for one probe direction. */
function shadowAlpha(
  layers: readonly ShadowLayer[],
  stroke: number,
  probe: number,
  dir: readonly [number, number],
): number {
  let clear = 1;
  for (const layer of layers) clear *= 1 - layer.alpha * layerCoverage(layer, stroke, probe, dir);
  return 1 - clear;
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * What the rider sees right next to a glyph with a shadow, over a scene colour. This is the
 * honest, conservative model of a shadow with no plate:
 *
 * - the glyph is a single isolated stroke `stroke` pixels wide (real text has neighbouring
 *   strokes that add to a blurred halo, so this is a lower bound);
 * - the pixel looked at is the one touching the glyph, `EDGE_PROBE_PX` outside its edge, which is
 *   what the eye uses to separate the glyph from the sky;
 * - the worst of the four sides is used (left, right, above, below), because a shadow offset
 *   favours the side it falls on;
 * - the shadow is black at the layers' opacity, composited the way a browser does in sRGB.
 */
export function glyphBackdrop(
  scene: Rgb,
  layers: readonly ShadowLayer[],
  stroke: number,
  probe: number = EDGE_PROBE_PX,
): Rgb {
  const alpha = Math.min(...DIRECTIONS.map((dir) => shadowAlpha(layers, stroke, probe, dir)));
  return composite(scene, [0, 0, 0], alpha);
}

/**
 * The glyphs that sit directly on the scene with a shadow and no plate, each with the thinnest
 * stroke it is drawn with (its smallest font size times a stem width of about 0.1 em, 0.12 em for
 * semibold) and its WCAG size class. `muted` grey is not allowed here. The imminent turn arrow
 * and the amber note and label are also drawn with the icon filter.
 */
export const GLYPH_TEXT: readonly {
  readonly role: string;
  readonly hex: string;
  readonly large: boolean;
  readonly stroke: number;
}[] = [
  { role: "speed digits (48 px, medium)", hex: color.text, large: true, stroke: 4.8 },
  { role: "turn distance (20 px, semibold)", hex: color.text, large: true, stroke: 2.4 },
  { role: "street instruction (12 px, medium)", hex: color.text, large: false, stroke: 1.2 },
  { role: "clock (12 px, semibold)", hex: color.text, large: false, stroke: 1.4 },
  {
    role: "km/h, GPS speed, time left, arrival, temperature (11 px, medium)",
    hex: color.textSecondary,
    large: false,
    stroke: 1.1,
  },
  {
    role: "GPS fallback label and telemetry note (11 px)",
    hex: color.caution,
    large: false,
    stroke: 1.1,
  },
  {
    role: "imminent turn arrow (26 px icon, 2 px stroke)",
    hex: color.cyan,
    large: false,
    stroke: 2.1,
  },
];
