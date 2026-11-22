/**
 * Public, build-time configuration. Every value has a working default, so the app
 * runs with no environment variables at all.
 */

/** Upstream source repository. Forks can point this at their own copy. */
const DEFAULT_SOURCE_URL = "https://github.com/lukeo100/Waylit";

export const sourceUrl: string = process.env.NEXT_PUBLIC_WAYLIT_SOURCE_URL || DEFAULT_SOURCE_URL;
