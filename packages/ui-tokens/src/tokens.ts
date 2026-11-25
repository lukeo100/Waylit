/**
 * Waylit design tokens. Platform neutral values, usable from the web app (as CSS
 * variables, see tokens.css) and later from React Native (as plain numbers and strings).
 *
 * Keep tokens.css in step with this file. A test fails if they drift.
 */

export const color = {
  /** Base surfaces: near black with a faint cool cast. Quiet, so the scene leads. */
  night950: "#05070b",
  night900: "#0a0d12",
  night800: "#12161c",
  night700: "#1d222a",
  /**
   * The one accent: soft cyan. The route, progress, active states and the heading marker.
   * Nothing else on the HUD is coloured, apart from the status colours below.
   */
  cyan: "#5fc8e8",
  cyanSoft: "#a5dff0",
  /** Text. Greys carry secondary information. */
  text: "#eef1f4",
  textSecondary: "#a4acb7",
  textMuted: "#747d89",
  /** Status. Caution is for safety, offline and fallback notes. Danger is for End trip only. */
  caution: "#e6b04f",
  danger: "#f0868f",
  dangerBorder: "rgba(200, 84, 96, 0.65)",
  dangerFill: "rgba(96, 22, 30, 0.7)",
  ok: "#46d08b",
  /**
   * Flat translucent panels, about 85 percent opaque, with a hairline border. `glassNight` is a
   * little more see-through after dark and `glassDay` more solid in sunlight. The riding screen
   * picks between them with one CSS variable, `--wl-panel`.
   */
  glass: "rgba(10, 13, 18, 0.85)",
  glassNight: "rgba(10, 13, 18, 0.78)",
  glassDay: "rgba(10, 13, 18, 0.94)",
  glassBorder: "rgba(255, 255, 255, 0.1)",
  /** The reserved credits strip: a darker, solid band that nothing overlaps. */
  credits: "#020306",
} as const;

export const font = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", "Cascadia Mono", "Roboto Mono", monospace',
} as const;

/** Type scale in rem, roughly a major third (1.25) from a 1rem base. */
export const fontSize = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.25rem",
  xl: "1.5625rem",
  "2xl": "1.953rem",
  "3xl": "2.441rem",
  /** Page titles on the home screen. */
  display: "4rem",
  /**
   * The riding screen sizes scale with the viewport so the HUD fits every landscape size without
   * clipping. `speed` is the vehicle speed: the biggest thing on the screen, with digits about
   * 30 percent of the screen height on a phone held sideways.
   */
  speed: "min(43dvh, 21vw)",
  /** Distance to the next turn. */
  hudTurn: "clamp(1.5rem, 9.5dvh, 3.5rem)",
  /** Street instruction, clock and temperature. */
  hudLg: "clamp(0.875rem, 4dvh, 1.3rem)",
  /** Values in the dock. Also scaled by width, because the dock is the tightest row. */
  hudDock: "clamp(0.8rem, min(3.8dvh, 2.1vw), 1.3rem)",
  /** Secondary figures: time left, dock labels, clock. */
  hudMd: "clamp(0.75rem, 3.3dvh, 1.05rem)",
  /** Units, captions and credits. */
  hudSm: "clamp(0.6875rem, 2.7dvh, 0.875rem)",
} as const;

export const lineHeight = {
  tight: "1.1",
  snug: "1.3",
  normal: "1.5",
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const letterSpacing = {
  display: "-0.02em",
  /** The big speed number is set tight. */
  speed: "-0.05em",
  normal: "0",
  wide: "0.02em",
} as const;

/** Spacing on a 4px grid, in rem. */
export const space = {
  "0": "0",
  "1": "0.25rem",
  "2": "0.5rem",
  "3": "0.75rem",
  "4": "1rem",
  "5": "1.5rem",
  "6": "2rem",
  "7": "3rem",
  "8": "4rem",
} as const;

/** Radius follows hierarchy: HUD panels are large, controls medium, chips fully round. */
export const radius = {
  sm: "6px",
  /** Artwork tile. */
  tile: "10px",
  md: "12px",
  /** The joined dock and other HUD panels. */
  lg: "20px",
  pill: "999px",
} as const;

export const blur = {
  sm: "8px",
  md: "16px",
  lg: "28px",
} as const;

/**
 * No glow on the HUD. `cyan` is kept for the 3D scene's route and heading marker, and `focus`
 * for the keyboard focus ring.
 */
export const glow = {
  cyan: "0 0 18px rgba(95, 200, 232, 0.45)",
  focus: "0 0 0 3px rgba(95, 200, 232, 0.6)",
} as const;

export const motion = {
  fast: "120ms",
  base: "200ms",
  slow: "360ms",
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/** Minimum touch target edge, for use while riding. */
export const touch = {
  min: "44px",
} as const;

export const tokens = {
  color,
  font,
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
  space,
  radius,
  blur,
  glow,
  motion,
  touch,
} as const;

export type Tokens = typeof tokens;
