import { color, plate } from "@waylit/ui-tokens";

/**
 * How the HUD stays readable over the 3D scene without darkening it.
 *
 * There is no full screen scrim, gradient or vignette. Each group of text over the scene (the
 * speed and turn card, the status chip, the start caption) sits on its own small plate of dark
 * glass that is only as big as the text. The plate's opacity follows the daylight factor, and its
 * floor is chosen so that every text colour allowed on a plate passes WCAG AA over pure white,
 * which is brighter than anything the scene can draw. The CSS class `.wl-plate` uses the same
 * tokens, and `readability.test.ts` checks the numbers.
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
 * Every text colour that may sit on a plate over the scene, with its WCAG size class. `large`
 * text (the speed and the turn distance) needs 3:1, the rest 4.5:1. `textMuted` is not on the
 * list: muted grey is for panels such as the dock, never for text over the scene.
 */
export const SCENE_TEXT: readonly {
  readonly role: string;
  readonly hex: string;
  readonly large: boolean;
}[] = [
  { role: "speed digits", hex: color.text, large: true },
  { role: "turn distance", hex: color.text, large: true },
  {
    role: "speed unit, GPS speed, street, time left, arrival",
    hex: color.textSecondary,
    large: false,
  },
  { role: "clock", hex: color.text, large: false },
  { role: "GPS fallback label and telemetry note", hex: color.caution, large: false },
  { role: "imminent turn arrow and accent", hex: color.cyan, large: false },
];
