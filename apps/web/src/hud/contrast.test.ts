import { describe, expect, it } from "vitest";
import { lightingParameters, hexToRgb } from "@waylit/map-provider";
import { color, scrim } from "@waylit/ui-tokens";

/**
 * WCAG contrast of the HUD text drawn on the scene, behind the top scrim, against the brightest
 * things the scene can show by day and the glow of the night effects. WCAG asks for 4.5:1 for
 * small text and 3:1 for large text.
 *
 * The background samples are the scene's own colours (the day palette and sky from
 * `lightingParameters` at noon, which is what the fallback map draws and what the Cesium sky is
 * tinted toward), plus worst cases: pure white (a white road in full sun) and a pale sunlit
 * photographic ground (#e8e4d8, an assumed worst case that has not been measured on a real Google tile screenshot).
 */

type Rgb = readonly [number, number, number];
const toRgb255 = (hex: string): Rgb => {
  const [r, g, b] = hexToRgb(hex);
  return [r * 255, g * 255, b * 255];
};
const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (bg: Rgb, over: Rgb, alpha: number): Rgb => [
  bg[0] * (1 - alpha) + over[0] * alpha,
  bg[1] * (1 - alpha) + over[1] * alpha,
  bg[2] * (1 - alpha) + over[2] * alpha,
];

const SCRIM_RGB: Rgb = [5, 7, 11];
const dvh = (value: string): number => Number.parseFloat(value);
/** The scrim's opacity at a height (percent of the screen) for a daylight factor. */
function scrimAlpha(daylight: number, yPercent: number): number {
  const strength = Number(scrim.night) + (Number(scrim.day) - Number(scrim.night)) * daylight;
  const solid = dvh(scrim.solid);
  const fade = dvh(scrim.fade);
  if (yPercent <= solid) return strength;
  if (yPercent >= fade) return 0;
  return strength * (1 - (yPercent - solid) / (fade - solid));
}

const noon = lightingParameters({
  timestamp: 0,
  position: { lat: 52.47, lng: 13.4 },
  sunElevationDegrees: 40,
  sunAzimuthDegrees: 180,
  phase: "day",
  daylightFactor: 1,
  warmth: 0,
});
const night = lightingParameters({
  timestamp: 0,
  position: { lat: 52.47, lng: 13.4 },
  sunElevationDegrees: -40,
  sunAzimuthDegrees: 0,
  phase: "night",
  daylightFactor: 0,
  warmth: 0,
});

const DAY_BACKGROUNDS: Record<string, Rgb> = {
  "sky horizon": toRgb255(noon.sky.horizon),
  "sky zenith": toRgb255(noon.sky.zenith),
  "sunlit land": toRgb255(noon.palette.land),
  "pale road": toRgb255(noon.palette.roadMajor),
  "pale building": toRgb255(noon.palette.building),
  "sunlit photographic ground": [232, 228, 216],
  "pure white": [255, 255, 255],
};
const NIGHT_BACKGROUNDS: Record<string, Rgb> = {
  "night horizon": toRgb255(night.sky.horizon),
  "night ground": toRgb255(night.palette.land),
  // A cyan edge glow right behind a piece of text, 35 percent strength, worst case.
  "cyan edge glow": mix(toRgb255(night.sky.horizon), toRgb255(color.cyan), 0.35),
};

/** HUD text and where its lowest edge sits, as a percent of the screen height (see the layout). */
const TEXT: readonly { name: string; hex: string; large: boolean; lowestPercent: number }[] = [
  { name: "speed digits", hex: color.text, large: true, lowestPercent: 38 },
  { name: "turn distance", hex: color.text, large: true, lowestPercent: 24 },
  { name: "street instruction", hex: color.textSecondary, large: false, lowestPercent: 34 },
  { name: "time and distance left", hex: color.textMuted, large: false, lowestPercent: 36 },
  { name: "arrival", hex: color.textMuted, large: false, lowestPercent: 40 },
  { name: "km/h", hex: color.textSecondary, large: false, lowestPercent: 45 },
  { name: "GPS speed", hex: color.textMuted, large: false, lowestPercent: 45 },
  { name: "GPS fallback label", hex: color.caution, large: false, lowestPercent: 45 },
  { name: "clock", hex: color.text, large: false, lowestPercent: 8 },
  { name: "temperature", hex: color.textSecondary, large: false, lowestPercent: 8 },
];

describe("HUD text contrast behind the top scrim", () => {
  for (const [label, backgrounds, daylight] of [
    ["day", DAY_BACKGROUNDS, 1],
    ["night", NIGHT_BACKGROUNDS, 0],
  ] as const) {
    for (const [bgName, bg] of Object.entries(backgrounds)) {
      for (const text of TEXT) {
        it(`${text.name} on ${bgName} by ${label}`, () => {
          const behind = mix(bg, SCRIM_RGB, scrimAlpha(daylight, text.lowestPercent));
          const ratio = contrast(toRgb255(text.hex), behind);
          expect(ratio).toBeGreaterThanOrEqual(text.large ? 3 : 4.5);
        });
      }
    }
  }

  it("is strongest in daylight and covers the whole top text area", () => {
    expect(scrimAlpha(1, 0)).toBeGreaterThan(scrimAlpha(0, 0));
    expect(scrimAlpha(1, 45)).toBe(scrimAlpha(1, 0));
    expect(scrimAlpha(1, 60)).toBe(0);
    expect(scrimAlpha(1, 53)).toBeGreaterThan(0);
  });
});
