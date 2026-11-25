import type { SceneLighting } from "./types";

/**
 * Scene lighting parameters, worked out from the sun state in `@waylit/core`.
 *
 * Every provider turns the same numbers into its own engine's settings, so the scene has the
 * same mood in both: bright and blue by day, low and orange around sunset, dark and quiet at
 * night to match the HUD palette. Pure maths with no renderer. The colours are fixed here and
 * are meant to sit with the design tokens (`night950` and `night900` for the dark end).
 */

/** Red, green and blue from 0 to 1. */
export type Rgb = readonly [number, number, number];

/** A unit vector in the local east, north, up frame at the rider. */
export interface Direction {
  readonly east: number;
  readonly north: number;
  readonly up: number;
}

/** Colours for the vector fallback map, as `#rrggbb`. */
export interface ScenePalette {
  readonly land: string;
  readonly water: string;
  readonly park: string;
  readonly landuse: string;
  readonly roadMinor: string;
  readonly roadMajor: string;
  readonly path: string;
  readonly rail: string;
  readonly building: string;
}

export interface SkyColours {
  /** Straight up. */
  readonly zenith: string;
  /** At the horizon. */
  readonly horizon: string;
  /** Distance haze and the colour behind everything. */
  readonly fog: string;
}

export interface LightingParameters {
  /** Unit vector from the rider toward the sun, in the local east, north, up frame. */
  readonly sunDirection: Direction;
  /** Direct light from 0 (none) to 1 (full sun). Fades out as the sun goes below the horizon. */
  readonly directIntensity: number;
  /** Fill light from 0 to 1. Never zero, so the night scene is dark but not black. */
  readonly ambientIntensity: number;
  /**
   * A multiplier for unlit photographic tiles (the baked daylight in Google Photorealistic 3D
   * Tiles). White by day, warm at sunset, dark blue at night.
   */
  readonly tint: Rgb;
  readonly sky: SkyColours;
  readonly palette: ScenePalette;
  /** The fallback map light as MapLibre's radial position: distance, azimuth, polar angle. */
  readonly lightPosition: readonly [number, number, number];
  readonly lightColor: string;
  /** Strength of the fallback map light, 0 to 1. */
  readonly lightIntensity: number;
  readonly isNight: boolean;
  /**
   * Changes only when something a rider could see has changed, so a provider can skip work for
   * the small steps between sampled times.
   */
  readonly key: string;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return [0, 0, 0];
  const value = parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function rgbToHex(rgb: Rgb): string {
  const part = (channel: number): string =>
    Math.round(clamp01(channel) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

/** Blends two `#rrggbb` colours. `t` of 0 is `a` and 1 is `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex([lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)]);
}

/** The unit vector toward the sun from its compass azimuth and its elevation, in degrees. */
export function sunDirection(azimuthDegrees: number, elevationDegrees: number): Direction {
  const az = toRadians(azimuthDegrees);
  const el = toRadians(elevationDegrees);
  return {
    east: Math.cos(el) * Math.sin(az),
    north: Math.cos(el) * Math.cos(az),
    up: Math.sin(el),
  };
}

/** Night end of every ramp. Close to the design tokens night950 and night900. */
const NIGHT = {
  tint: [0.09, 0.115, 0.19] as Rgb,
  zenith: "#05070b",
  horizon: "#10151d",
  palette: {
    land: "#0b0e13",
    water: "#07131c",
    park: "#0c1511",
    landuse: "#0d1117",
    roadMinor: "#232b36",
    roadMajor: "#323d4d",
    path: "#1a212b",
    rail: "#151b23",
    building: "#171d27",
  } satisfies ScenePalette,
} as const;

const DAY = {
  tint: [1, 1, 1] as Rgb,
  zenith: "#4a86cf",
  horizon: "#bcd9ee",
  palette: {
    land: "#e4e5dc",
    water: "#a6cbe3",
    park: "#c6ddb2",
    landuse: "#dcdfd3",
    roadMinor: "#fbfbf8",
    roadMajor: "#ffffff",
    path: "#cfd2c6",
    rail: "#b9bcb4",
    building: "#cfd0d3",
  } satisfies ScenePalette,
} as const;

/** The orange of a low sun, mixed in by `warmth`. */
const WARM_LIGHT = "#ff9a52";
const WARM_HORIZON = "#ff9d63";
const WARM_ZENITH = "#3a4a82";
const WARM_TINT: Rgb = [1, 0.8, 0.62];

function mixPalette(a: ScenePalette, b: ScenePalette, t: number): ScenePalette {
  return {
    land: mixHex(a.land, b.land, t),
    water: mixHex(a.water, b.water, t),
    park: mixHex(a.park, b.park, t),
    landuse: mixHex(a.landuse, b.landuse, t),
    roadMinor: mixHex(a.roadMinor, b.roadMinor, t),
    roadMajor: mixHex(a.roadMajor, b.roadMajor, t),
    path: mixHex(a.path, b.path, t),
    rail: mixHex(a.rail, b.rail, t),
    building: mixHex(a.building, b.building, t),
  };
}

function warmPalette(palette: ScenePalette, amount: number): ScenePalette {
  const warm = (colour: string): string => mixHex(colour, WARM_LIGHT, amount);
  return {
    land: warm(palette.land),
    water: palette.water,
    park: palette.park,
    landuse: warm(palette.landuse),
    roadMinor: warm(palette.roadMinor),
    roadMajor: warm(palette.roadMajor),
    path: warm(palette.path),
    rail: palette.rail,
    building: warm(palette.building),
  };
}

/** Works out every lighting parameter for a sun state. */
export function lightingParameters(lighting: SceneLighting): LightingParameters {
  const f = clamp01(lighting.daylightFactor);
  const w = clamp01(lighting.warmth);
  const elevation = lighting.sunElevationDegrees;

  const directIntensity = smoothstep(-2, 20, elevation);
  const ambientIntensity = lerp(0.16, 0.7, f);

  // Photographic tiles: dark blue to white by daylight, then warmed toward orange at sunset.
  const base: Rgb = [
    lerp(NIGHT.tint[0], DAY.tint[0], f),
    lerp(NIGHT.tint[1], DAY.tint[1], f),
    lerp(NIGHT.tint[2], DAY.tint[2], f),
  ];
  const warmAmount = w * 0.75;
  const exposure = 1 + 0.12 * w;
  const tint: Rgb = [
    Math.min(1.1, lerp(base[0], base[0] * WARM_TINT[0], warmAmount) * exposure),
    Math.min(1.1, lerp(base[1], base[1] * WARM_TINT[1], warmAmount) * exposure),
    Math.min(1.1, lerp(base[2], base[2] * WARM_TINT[2], warmAmount) * exposure),
  ];

  const horizonDay = mixHex(NIGHT.horizon, DAY.horizon, f);
  const zenithDay = mixHex(NIGHT.zenith, DAY.zenith, f);
  const horizon = mixHex(horizonDay, WARM_HORIZON, w * 0.7);
  const zenith = mixHex(zenithDay, WARM_ZENITH, w * 0.45);
  const sky: SkyColours = { zenith, horizon, fog: horizon };

  const palette = warmPalette(mixPalette(NIGHT.palette, DAY.palette, f), w * 0.2);

  // MapLibre light. It keeps a little height at night so buildings still read as solid shapes.
  const polar = Math.min(80, Math.max(8, 90 - Math.max(elevation, 10)));
  const lightColor = mixHex(mixHex("#8aa0c8", "#ffffff", f), WARM_LIGHT, w * 0.6);
  const lightIntensity = lerp(0.12, 0.6, f);

  const key = [
    Math.round(f * 50),
    Math.round(w * 20),
    Math.round(lighting.sunAzimuthDegrees / 3),
    Math.round(elevation / 2),
  ].join("|");

  return {
    sunDirection: sunDirection(lighting.sunAzimuthDegrees, elevation),
    directIntensity,
    ambientIntensity,
    tint,
    sky,
    palette,
    lightPosition: [1.5, lighting.sunAzimuthDegrees, polar],
    lightColor,
    lightIntensity,
    isNight: f < 0.05,
    key,
  };
}
