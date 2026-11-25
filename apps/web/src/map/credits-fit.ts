/**
 * Keeps the credits strip to one line (Google asks for its attribution on one line) without
 * ever hiding the Google logo or the Cesium ion logo. Cesium draws logos and credit text
 * inline when the credit is set to show on screen, and otherwise puts the text behind its
 * "Data attribution" link, which opens the full list. Google allows a clickable data sources
 * control when space is tight. So when the text no longer fits on one line the text moves
 * behind that link, and when there is clearly room again it comes back. The logos are never
 * part of this: they stay on screen in both modes.
 */

export type CreditsMode = "inline" | "link";

export interface CreditsFitInput {
  /** What the strip shows now. */
  readonly mode: CreditsMode;
  /** True when the inline text is wider than the space it has (or wraps onto a second line). */
  readonly textOverflows: boolean;
  /** The width of the strip's content box now, in pixels. */
  readonly widthPx: number;
  /** The strip width at the moment the text last moved behind the link, if it did. */
  readonly collapsedAtWidthPx: number | undefined;
}

/** How much wider than when it collapsed the strip must get before the text comes back. */
export const CREDITS_EXPAND_MARGIN_PX = 160;

/**
 * Decides the mode. The text collapses as soon as it overflows. It only comes back once the strip
 * is a good deal wider than when it collapsed, so it does not flicker on the edge of fitting.
 */
export function nextCreditsMode(input: CreditsFitInput): CreditsMode {
  if (input.mode === "inline") return input.textOverflows ? "link" : "inline";
  const collapsedAt = input.collapsedAtWidthPx;
  if (collapsedAt === undefined) return "link";
  return input.widthPx >= collapsedAt + CREDITS_EXPAND_MARGIN_PX ? "inline" : "link";
}
