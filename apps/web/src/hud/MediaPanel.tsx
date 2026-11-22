import { artworkDataUri, formatStopwatch, type MediaControls, type MediaState } from "@waylit/core";
import { HOLD_TO_PRESS_MS } from "@/ride/guard";
import { HoldButton } from "./HoldButton";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./icons";

interface MediaPanelProps {
  readonly state: MediaState;
  readonly controls: MediaControls;
  /** True while the speed guard is on and presses must be held. */
  readonly guarded: boolean;
}

const BUTTON =
  "min-h-12 min-w-12 rounded-md border border-glass-border bg-night-800/80 text-text transition-colors duration-200 ease-out hover:border-volt";

/**
 * Bottom left: the mock media player. Artwork, title, artist, progress and the three controls.
 * It plays through `MediaPlayer`, and the same player is mirrored to the Media Session API,
 * so the lock screen and headset buttons control it too. Above the guard speed the panel dims
 * and each button needs a short hold.
 */
export function MediaPanel({ state, controls, guarded }: MediaPanelProps) {
  const playing = state.status === "playing";
  const progressPercent = Math.round(state.progress * 100);

  return (
    <section
      aria-label="Media player"
      data-testid="media-panel"
      data-guarded={guarded}
      className={`wl-glass flex flex-col gap-2 p-3 short:gap-1.5 short:p-2.5 ${guarded ? "opacity-80" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span
          role="img"
          aria-label={`Artwork for ${state.track.title}`}
          data-testid="artwork"
          className="size-14 shrink-0 rounded-md border border-glass-border bg-cover bg-center short:size-12"
          style={{ backgroundImage: `url("${artworkDataUri(state.track.artwork)}")` }}
        />
        <div className="min-w-0 flex-1">
          <p
            data-testid="track-title"
            className="truncate text-base leading-snug font-semibold text-text"
          >
            {state.track.title}
          </p>
          <p
            data-testid="track-artist"
            className="truncate text-sm leading-snug text-text-secondary"
          >
            {state.track.artist}
          </p>
          <div
            role="progressbar"
            aria-label="Track progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-night-700"
          >
            <div className="h-full rounded-pill bg-cyan" style={{ width: `${progressPercent}%` }} />
          </div>
          <p
            data-testid="track-time"
            className={`mt-0.5 text-xs leading-snug tabular-nums ${guarded ? "text-caution" : "text-text-secondary"}`}
          >
            {guarded
              ? "Hold a button to use it"
              : `${formatStopwatch(state.positionSeconds)} / ${formatStopwatch(state.durationSeconds)}`}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <HoldButton
          label="Previous track"
          guarded={guarded}
          holdMs={HOLD_TO_PRESS_MS}
          onActivate={() => {
            controls.previous();
          }}
          className={`${BUTTON} flex-1`}
          data-testid="media-previous"
        >
          <PreviousIcon size={24} />
        </HoldButton>
        <HoldButton
          label={playing ? "Pause" : "Play"}
          guarded={guarded}
          holdMs={HOLD_TO_PRESS_MS}
          onActivate={() => {
            controls.toggle();
          }}
          className={`${BUTTON} min-h-12 flex-[1.4] border-volt bg-volt text-night-950 hover:bg-volt-soft`}
          data-testid="media-toggle"
        >
          {playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
        </HoldButton>
        <HoldButton
          label="Next track"
          guarded={guarded}
          holdMs={HOLD_TO_PRESS_MS}
          onActivate={() => {
            controls.next();
          }}
          className={`${BUTTON} flex-1`}
          data-testid="media-next"
        >
          <NextIcon size={24} />
        </HoldButton>
      </div>
    </section>
  );
}
