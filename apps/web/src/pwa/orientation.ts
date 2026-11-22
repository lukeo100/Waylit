/**
 * Landscape lock, attempted politely.
 *
 * `screen.orientation.lock` only works in some contexts (installed standalone apps on
 * Android, or fullscreen) and only after a user gesture. The manifest already asks for
 * landscape, so this is a bonus. Call it from a click handler. It never throws and
 * returns false when the lock was not applied.
 */

export interface OrientationEnvironment {
  readonly screen?:
    { readonly orientation?: { lock?: (orientation: "landscape") => Promise<void> } } | undefined;
  readonly standalone: boolean;
}

export async function tryLockLandscape(env: OrientationEnvironment): Promise<boolean> {
  if (!env.standalone) return false;
  const lock = env.screen?.orientation?.lock;
  if (typeof lock !== "function") return false;
  try {
    await lock.call(env.screen?.orientation, "landscape");
    return true;
  } catch {
    return false;
  }
}
