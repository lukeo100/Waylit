"use client";

import { useState } from "react";
import { artworkDataUri, type MediaControls, type MediaState } from "@waylit/core";
import { HOLD_TO_PRESS_MS } from "@/ride/guard";
import { HoldButton } from "./HoldButton";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./icons";

interface MediaPanelProps {
  readonly state: MediaState;
  readonly controls: MediaControls;
  /** True while the speed guard is on and presses must be held. */
  readonly guarded: boolean;
}

/** Round, at least 44 pixels across. The ring and the held state are drawn by HoldButton. */
const BUTTON =
  "size-[clamp(2.75rem,9.5dvh,3.5rem)] shrink-0 rounded-full border border-glass-border bg-white/5 text-text transition-colors duration-200 ease-out hover:border-cyan data-[holding=true]:border-cyan data-[holding=true]:bg-cyan/25";

/**
 * Left half of the dock: the mock media player. Artwork tile, title and artist, then previous,
 * play or pause and next, with a thin progress line along the bottom edge. It plays through
 * `MediaPlayer`, and the same player is mirrored to the Media Session API, so the lock screen
 * and headset buttons control it too.
 *
 * Above the guard speed each button shows a ring that says it needs a hold. While one is held
 * the ring fills, the button takes a filled state, and the artist line says "Keep holding", so
 * the feedback is still there with reduced motion.
 */
export function MediaPanel({ state, controls, guarded }: MediaPanelProps) {
  const playing = state.status === "playing";
  const progressPercent = Math.round(state.progress * 100);
  const [held, setHeld] = useState(0);
  // The count is only used while guarded. Releasing the guard drops any hold on its own.
  const holding = guarded && held > 0;
  const onHoldChange = (isHolding: boolean): void => {
    setHeld((count) => Math.max(count + (isHolding ? 1 : -1), 0));
  };

  return (
    <section
      aria-label="Media player"
      data-testid="media-panel"
      data-guarded={guarded}
      data-holding={holding}
      className="relative flex min-w-0 items-center gap-[clamp(0.4rem,1.3vw,0.9rem)] px-[clamp(0.5rem,1.6vw,1rem)] py-[clamp(0.25rem,1.4dvh,0.6rem)]"
    >
      <span
        role="img"
        aria-label={`Artwork for ${state.track.title}`}
        data-testid="artwork"
        className="size-[clamp(2.5rem,12.5dvh,4rem)] shrink-0 rounded-tile border border-glass-border bg-cover bg-center"
        style={{ backgroundImage: `url("${artworkDataUri(state.track.artwork)}")` }}
      />
      <div className="min-w-0 flex-1">
        <p
          data-testid="track-title"
          className="truncate text-hud-dock leading-snug font-semibold text-text"
        >
          {state.track.title}
        </p>
        <p
          data-testid="track-artist"
          aria-live="polite"
          className={`truncate text-hud-md leading-snug ${holding ? "font-medium text-cyan" : "text-text-secondary"}`}
        >
          {holding ? "Keep holding" : state.track.artist}
        </p>
      </div>

      <div
        role="group"
        aria-label="Playback"
        className={`flex shrink-0 items-center gap-[clamp(0.15rem,0.7vw,0.5rem)] ${guarded && !holding ? "opacity-90" : ""}`}
      >
        <HoldButton
          label="Previous track"
          guarded={guarded}
          holdMs={HOLD_TO_PRESS_MS}
          feedback="ring"
          onHoldChange={onHoldChange}
          onActivate={() => {
            controls.previous();
          }}
          className={BUTTON}
          data-testid="media-previous"
        >
          <PreviousIcon size="45%" />
        </HoldButton>
        <HoldButton
          label={playing ? "Pause" : "Play"}
          guarded={guarded}
          holdMs={HOLD_TO_PRESS_MS}
          feedback="ring"
          onHoldChange={onHoldChange}
          onActivate={() => {
            controls.toggle();
          }}
          className={`${BUTTON} size-[clamp(3rem,11dvh,3.75rem)] border-cyan/60 text-cyan`}
          data-testid="media-toggle"
        >
          {playing ? <PauseIcon size="48%" /> : <PlayIcon size="48%" />}
        </HoldButton>
        <HoldButton
          label="Next track"
          guarded={guarded}
          holdMs={HOLD_TO_PRESS_MS}
          feedback="ring"
          onHoldChange={onHoldChange}
          onActivate={() => {
            controls.next();
          }}
          className={BUTTON}
          data-testid="media-next"
        >
          <NextIcon size="45%" />
        </HoldButton>
      </div>

      <div
        role="progressbar"
        aria-label="Track progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10"
      >
        <div
          data-testid="track-progress"
          className="h-full bg-cyan"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </section>
  );
}
