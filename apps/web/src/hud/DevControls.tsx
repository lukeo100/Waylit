import { PLAYBACK_SPEEDS } from "./dev-controls";

interface DevControlsProps {
  readonly playbackSpeed: number;
  readonly telemetryLost: boolean;
  readonly onPlaybackSpeed: (multiplier: number) => void;
  readonly onTelemetryLost: (lost: boolean) => void;
}

/**
 * Developer controls for the simulation. They are hidden in production builds unless the
 * address has `?dev=1`. One changes how fast the simulated ride runs. The other stops scooter
 * telemetry, so the GPS fallback for speed and trip distance can be seen.
 */
export function DevControls({
  playbackSpeed,
  telemetryLost,
  onPlaybackSpeed,
  onTelemetryLost,
}: DevControlsProps) {
  return (
    <aside
      aria-label="Simulation dev controls"
      data-testid="dev-controls"
      className="wl-glass pointer-events-auto flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 py-1 text-xs text-text-secondary"
    >
      <span className="font-semibold text-text">Dev</span>
      <span role="group" aria-label="Playback speed" className="flex items-center gap-1">
        {PLAYBACK_SPEEDS.map((multiplier) => (
          <button
            key={multiplier}
            type="button"
            aria-pressed={playbackSpeed === multiplier}
            onClick={() => {
              onPlaybackSpeed(multiplier);
            }}
            className={`min-h-8 min-w-8 rounded-sm border px-1.5 text-xs font-semibold ${playbackSpeed === multiplier ? "border-cyan bg-cyan text-night-950" : "border-glass-border bg-night-800 text-text"}`}
          >
            {multiplier}x
          </button>
        ))}
      </span>
      <label className="flex min-h-8 items-center gap-1.5 text-text">
        <input
          type="checkbox"
          checked={telemetryLost}
          onChange={(event) => {
            onTelemetryLost(event.target.checked);
          }}
          className="size-4 accent-cyan"
        />
        Lose scooter data
      </label>
    </aside>
  );
}
