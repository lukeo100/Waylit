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
 */
export function useMockMedia(): MockMedia {
  const [player] = useState(() => new MediaPlayer({ tracks: MOCK_TRACKS }));
  const [state, setState] = useState<MediaState>(() => player.getState());

  useEffect(() => {
    const engine = createToneEngine();
    const unsubscribe = player.subscribe((next) => {
      setState(next);
      engine?.apply(next);
    });
    const unbind = bindMediaSession(player);
    const timer = window.setInterval(() => {
      const next = player.getState();
      if (next.status === "playing") setState(next);
    }, PROGRESS_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      unbind();
      unsubscribe();
      engine?.dispose();
    };
  }, [player]);

  return { state, controls: player };
}
