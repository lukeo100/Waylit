import type { SunClockMode } from "@waylit/core";
import { SUN_MODE_LABEL, otherSunMode } from "./sun-mode";

interface StartPromptProps {
  readonly onStart: () => void;
  /** How the scene's light is chosen. Follows the device clock by default. */
  readonly sunMode: SunClockMode;
  readonly onSunMode: (mode: SunClockMode) => void;
}

/**
 * Shown before a trip, low in the clear middle of the screen so it stays off the speed and the
 * turn and above the dock. The page places it. It is the only thing over the scene area.
 *
 * Beside the start button is the light switch: "Light follows my clock" (the default, so the
 * scene is bright when it is day on your phone and dark when it is night) or "Real sun at the
 * route" (the demo route is in Berlin, so it may be a different time of day there).
 */
export function StartPrompt({ onStart, sunMode, onSunMode }: StartPromptProps) {
  return (
    <div
      data-testid="start-prompt"
      className="pointer-events-auto flex flex-col items-center gap-[0.8dvh] text-center"
    >
      <div className="flex items-center gap-[clamp(0.5rem,1.2vw,0.9rem)]">
        <button
          type="button"
          onClick={onStart}
          data-testid="start-trip"
          className="inline-flex min-h-[clamp(2.75rem,12dvh,3.5rem)] min-w-[clamp(9rem,22vw,12rem)] items-center justify-center rounded-md bg-cyan px-6 text-hud-lg font-semibold text-night-950 transition-colors duration-200 ease-out hover:bg-cyan-soft"
        >
          Start trip
        </button>
        <button
          type="button"
          data-testid="sun-mode"
          data-mode={sunMode}
          aria-label={`Scene light: ${SUN_MODE_LABEL[sunMode]}. Tap to switch to ${SUN_MODE_LABEL[otherSunMode(sunMode)]}.`}
          onClick={() => {
            onSunMode(otherSunMode(sunMode));
          }}
          className="inline-flex min-h-11 items-center rounded-md border border-glass-border bg-glass px-4 text-hud-sm font-medium text-text-secondary transition-colors duration-200 ease-out hover:text-text"
        >
          {SUN_MODE_LABEL[sunMode]}
        </button>
      </div>
      <p className="text-hud-sm leading-snug text-text-secondary">
        Simulated ride on a demo route. Nothing here controls your scooter.
      </p>
    </div>
  );
}
