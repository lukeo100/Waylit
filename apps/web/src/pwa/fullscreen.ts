/**
 * Fullscreen for the riding screen, attempted politely.
 *
 * An installed app asks for fullscreen in its manifest, which hides the phone's status bar and
 * navigation bar. When the page runs in a browser tab, or the install predates the manifest
 * change, the Fullscreen API does the same job after a user gesture. Call `enterFullscreen`
 * from a click handler (the Start trip tap). Both functions are feature detected, never throw
 * and do nothing when the browser refuses.
 */

export interface FullscreenElementLike {
  requestFullscreen?: (options?: { navigationUI?: "hide" | "show" | "auto" }) => Promise<void>;
}

export interface FullscreenDocumentLike {
  readonly fullscreenElement?: unknown;
  readonly documentElement?: FullscreenElementLike | undefined;
  exitFullscreen?: () => Promise<void>;
}

export interface FullscreenEnvironment {
  readonly document?: FullscreenDocumentLike | undefined;
  /** True when the app already runs fullscreen through its manifest (display-mode: fullscreen). */
  readonly displayModeFullscreen: boolean;
}

/** Looks at the real browser. Returns an empty environment on the server. */
export function browserFullscreenEnvironment(): FullscreenEnvironment {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { displayModeFullscreen: false };
  }
  const displayModeFullscreen =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: fullscreen)").matches;
  return { document: document as FullscreenDocumentLike, displayModeFullscreen };
}

/**
 * Requests fullscreen for the whole page. Returns true when fullscreen was requested and
 * granted, and false when it was skipped (already fullscreen, or unsupported) or refused.
 */
export async function enterFullscreen(env: FullscreenEnvironment): Promise<boolean> {
  if (env.displayModeFullscreen) return false;
  const doc = env.document;
  if (!doc || doc.fullscreenElement) return false;
  const root = doc.documentElement;
  if (typeof root?.requestFullscreen !== "function") return false;
  try {
    await root.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Leaves fullscreen that the Fullscreen API entered. It does nothing when the page is not in
 * API fullscreen, which includes an installed app that is fullscreen through its manifest.
 */
export async function exitFullscreen(env: FullscreenEnvironment): Promise<boolean> {
  const doc = env.document;
  if (!doc || !doc.fullscreenElement) return false;
  if (typeof doc.exitFullscreen !== "function") return false;
  try {
    await doc.exitFullscreen();
    return true;
  } catch {
    return false;
  }
}
