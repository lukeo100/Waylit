"use client";

import { useEffect, useState } from "react";
import { MOCK_TRACKS, MediaPlayer, type MediaControls, type MediaState } from "@waylit/core";
import { bindMediaSession } from "./mediaSession";
import { createToneEngine } from "./toneEngine";

/** How often progress is refreshed while a track plays, in milliseconds. */
const PROGRESS_INTERVAL_MS = 500;

export interface MockMedia {
  readonly state: MediaState;
  readonly controls: MediaControls;
}

/**
 * Runs the mock media player in the browser. It creates a `MediaPlayer` over the mock tracks,
 * plays them with the tone engine and mirrors them to the Media Session API. It returns the
 * current state and the controls. It draws nothing, so the HUD can use it however it likes.
 *
 * While `active` is false the media is stopped: the sound is released, the Media Session
 * handlers and metadata are cleared so the lock screen widget goes away, and the player is
 * paused and rewound. Turning `active` back on starts again from the first track, paused.
 */
export function useMockMedia(active = true): MockMedia {
  const [player] = useState(() => new MediaPlayer({ tracks: MOCK_TRACKS }));
  const [state, setState] = useState<MediaState>(() => player.getState());

  // Keeps the returned state current. This runs whether or not the media is active.
  useEffect(() => {
    const unsubscribe = player.subscribe(setState);
    const timer = window.setInterval(() => {
      const next = player.getState();
      if (next.status === "playing") setState(next);
    }, PROGRESS_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [player]);

  // Sound and the Media Session, only while active.
  useEffect(() => {
    if (!active) {
      player.stop();
      return undefined;
    }
    const engine = createToneEngine();
    const unsubscribe = player.subscribe((next) => {
      engine?.apply(next);
    });
    const unbind = bindMediaSession(player);
    // A remount can find the player already playing, so bring the sound in line with it.
    engine?.apply(player.getState());
    return () => {
      unbind();
      unsubscribe();
      engine?.dispose();
    };
  }, [player, active]);

  return { state, controls: player };
}
