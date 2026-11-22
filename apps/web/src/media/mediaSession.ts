import { artworkDataUri, type MediaPlayer, type MediaState } from "@waylit/core";

/**
 * Mirrors a `MediaPlayer` to the browser Media Session API, so the phone's lock screen,
 * notification and headset buttons show the mock track and can drive it. It has no UI of its
 * own. The HUD (task 6) draws the in-app player from the same `MediaPlayer`.
 *
 * Browsers only show Media Session controls while the page is playing audio through a media
 * element. The tone engine in `toneEngine.ts` arranges that.
 */

export interface MediaSessionDeps {
  /** Defaults to `navigator.mediaSession` when the browser has one. */
  readonly mediaSession?: MediaSession | undefined;
  /** Defaults to `new MediaMetadata(init)`. Replaceable so tests need no browser. */
  readonly createMetadata?: (init: MediaMetadataInit) => MediaMetadata;
}

type SessionAction = "play" | "pause" | "nexttrack" | "previoustrack";

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

  const artworkCache = new Map<string, string>();
  let shownTrackId: string | undefined;

  const publish = (state: MediaState): void => {
    if (state.track.id !== shownTrackId) {
      shownTrackId = state.track.id;
      let src = artworkCache.get(state.track.id);
      if (src === undefined) {
        src = artworkDataUri(state.track.artwork);
        artworkCache.set(state.track.id, src);
      }
      session.metadata = createMetadata({
        title: state.track.title,
        artist: state.track.artist,
        album: state.track.album,
        artwork: [{ src, sizes: "512x512", type: "image/svg+xml" }],
      });
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

  const handlers: Record<SessionAction, () => void> = {
    play: () => player.play(),
    pause: () => player.pause(),
    nexttrack: () => player.next(),
    previoustrack: () => player.previous(),
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
