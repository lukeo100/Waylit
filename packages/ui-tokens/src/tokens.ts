/**
 * Waylit design tokens. Platform neutral values, usable from the web app (as CSS
 * variables, see tokens.css) and later from React Native (as plain numbers and strings).
 *
 * Keep tokens.css in step with this file. A test fails if they drift.
 */

export const color = {
  /** Base surfaces, a deep blue night rather than neutral black. */
  night950: "#05080f",
  night900: "#0a1220",
  night800: "#121c2e",
  night700: "#1c2940",
  /** Primary accent: electric blue. Route, primary actions, active state. */
  volt: "#2e8bff",
  voltSoft: "#7fb6ff",
  /** Secondary accent: cyan. Holographic elements, focus, live data. */
  cyan: "#35e0ff",
  cyanSoft: "#a6f1ff",
  /** Text. */
  text: "#eaf3ff",
  textSecondary: "#9db0cc",
  textMuted: "#6e82a4",
  /** Status. Caution is reserved for safety and warnings. */
  caution: "#ffb23f",
  danger: "#ff5a6b",
  ok: "#3ddc97",
  /** Glass panels. */
  glass: "rgba(14, 24, 42, 0.55)",
  glassStrong: "rgba(14, 24, 42, 0.78)",
  glassBorder: "rgba(150, 200, 255, 0.14)",
  glassHighlight: "rgba(166, 241, 255, 0.08)",
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
  /** Speed readout and other glanceable numbers. */
  display: "4rem",
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
  md: "12px",
  lg: "20px",
  pill: "999px",
} as const;

export const blur = {
  sm: "8px",
  md: "16px",
  lg: "28px",
} as const;

export const glow = {
  volt: "0 0 24px rgba(46, 139, 255, 0.35)",
  cyan: "0 0 18px rgba(53, 224, 255, 0.45)",
  focus: "0 0 0 3px rgba(53, 224, 255, 0.6)",
} as const;

export const motion = {
  fast: "120ms",
  base: "200ms",
  slow: "360ms",
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/** Minimum touch target edge, for use while riding. */
export const touch = {
  min: "48px",
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
