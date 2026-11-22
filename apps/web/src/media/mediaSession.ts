import { artworkDataUri, type MediaPlayer, type MediaState } from "@waylit/core";
import { rasteriseArtwork } from "./artwork-png";

/**
 * Mirrors a `MediaPlayer` to the browser Media Session API, so the phone's lock screen,
 * notification and headset buttons show the mock track and can drive it. It has no UI of its
 * own. The riding screen draws the in-app player from the same `MediaPlayer`.
 *
 * Browsers only show Media Session controls while the page is playing audio through a media
 * element. The tone engine in `toneEngine.ts` arranges that.
 */

export interface MediaSessionDeps {
  /** Defaults to `navigator.mediaSession` when the browser has one. */
  readonly mediaSession?: MediaSession | undefined;
  /** Defaults to `new MediaMetadata(init)`. Replaceable so tests need no browser. */
  readonly createMetadata?: (init: MediaMetadataInit) => MediaMetadata;
  /**
   * Turns an SVG data URI into a PNG data URI of the given size. Defaults to a canvas based
   * one. Replaceable so tests need no browser. Resolve to undefined to keep the SVG only.
   */
  readonly rasterise?: (svgDataUri: string, size: number) => Promise<string | undefined>;
}

type SessionAction = "play" | "pause" | "nexttrack" | "previoustrack" | "seekto";

/** PNG sizes offered to the browser, which picks the one that suits the notification. */
const PNG_SIZES = [512, 256] as const;

function browserMediaSession(): MediaSession | undefined {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return undefined;
  return navigator.mediaSession;
}

/**
 * Starts mirroring. Returns a function that stops it and clears the handlers. Does nothing,
 * and returns a no-op, when the browser has no Media Session support.
 */
export function bindMediaSession(player: MediaPlayer, deps: MediaSessionDeps = {}): () => void {
  const session = "mediaSession" in deps ? deps.mediaSession : browserMediaSession();
  if (!session) return () => undefined;
  const createMetadata = deps.createMetadata ?? ((init) => new MediaMetadata(init));

  const rasterise = deps.rasterise ?? rasteriseArtwork;

  const svgCache = new Map<string, string>();
  const pngCache = new Map<string, readonly MediaImage[]>();
  let shownTrackId: string | undefined;
  let disposed = false;

  const metadataFor = (state: MediaState, artwork: readonly MediaImage[]): MediaMetadata =>
    createMetadata({
      title: state.track.title,
      artist: state.track.artist,
      album: state.track.album,
      artwork: [...artwork],
    });

  const svgArtwork = (state: MediaState): MediaImage => {
    let src = svgCache.get(state.track.id);
    if (src === undefined) {
      src = artworkDataUri(state.track.artwork);
      svgCache.set(state.track.id, src);
    }
    return { src, sizes: "512x512", type: "image/svg+xml" };
  };

  /**
   * Adds PNG copies of the artwork once they are drawn, ahead of the SVG. The notification is
   * shown straight away with the SVG, so a slow or failed raster step costs nothing.
   */
  const upgradeArtwork = (state: MediaState): void => {
    const trackId = state.track.id;
    const apply = (png: readonly MediaImage[]): void => {
      if (disposed || shownTrackId !== trackId || png.length === 0) return;
      session.metadata = metadataFor(state, [...png, svgArtwork(state)]);
    };
    const cached = pngCache.get(trackId);
    if (cached) {
      apply(cached);
      return;
    }
    const svg = svgArtwork(state).src;
    void Promise.all(PNG_SIZES.map((size) => rasterise(svg, size).catch(() => undefined))).then(
      (results) => {
        const png: MediaImage[] = [];
        results.forEach((src, i) => {
          if (src !== undefined) {
            const size = PNG_SIZES[i] as number;
            png.push({ src, sizes: `${size}x${size}`, type: "image/png" });
          }
        });
        pngCache.set(trackId, png);
        apply(png);
      },
    );
  };

  const publish = (state: MediaState): void => {
    if (state.track.id !== shownTrackId) {
      shownTrackId = state.track.id;
      session.metadata = metadataFor(state, [svgArtwork(state)]);
      upgradeArtwork(state);
    }
    session.playbackState = state.status;
    try {
      session.setPositionState({
        duration: state.durationSeconds,
        playbackRate: 1,
        position: state.positionSeconds,
      });
    } catch {
      // Some browsers reject position state they consider invalid. The rest still works.
    }
  };

  const handlers: Record<SessionAction, MediaSessionActionHandler> = {
    play: () => player.play(),
    pause: () => player.pause(),
    nexttrack: () => player.next(),
    previoustrack: () => player.previous(),
    // The scrubber on a lock screen or a headset seek button.
    seekto: (details) => {
      if (details.seekTime !== undefined) player.seek(details.seekTime);
    },
  };
  for (const action of Object.keys(handlers) as SessionAction[]) {
    try {
      session.setActionHandler(action, handlers[action]);
    } catch {
      // An older browser may not support every action.
    }
  }

  const unsubscribe = player.subscribe(publish);
  publish(player.getState());

  return () => {
    disposed = true;
    unsubscribe();
    for (const action of Object.keys(handlers) as SessionAction[]) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // Nothing to clean up.
      }
    }
    session.metadata = null;
    session.playbackState = "none";
  };
}
