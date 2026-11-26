import type { SunClockMode } from "@waylit/core";
import type { GpsChoice } from "@/map/map-settings";
import { SUN_MODE_LABEL, otherSunMode } from "./sun-mode";

interface StartPromptProps {
  readonly onStart: () => void;
  /** How the scene's light is chosen. Follows the device clock by default. */
  readonly sunMode: SunClockMode;
  readonly onSunMode: (mode: SunClockMode) => void;
  /** Where the position comes from. Live GPS shows what will be asked before the rider taps. */
  readonly gps?: GpsChoice;
}

/** The line under the button for each position source. For live GPS it is the permission note. */
export const START_CAPTION: Record<GpsChoice, string> = {
  sim: "Simulated ride on a demo route. Nothing here controls your scooter.",
  live: "Free ride on your phone's GPS. Your browser asks for location when you start. It stays on this device, never stored or sent.",
  replay: "Free ride on a generated GPS trace. No location is used.",
};

/**
 * Shown before a trip, low in the clear middle of the screen so it stays off the speed and the
 * turn and above the dock. The page places it. It is the only thing over the scene area, and
 * its caption sits on a small plate so it reads on a bright scene.
 *
 * Beside the start button is the light switch: "Light follows my clock" (the default, so the
 * scene is bright when it is day on your phone and dark when it is night) or "Real sun at the
 * route" (the demo route is in Berlin, so it may be a different time of day there).
 */
export function StartPrompt({ onStart, sunMode, onSunMode, gps = "sim" }: StartPromptProps) {
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
          {gps === "sim" ? "Start trip" : "Start free ride"}
        </button>
        <button
          type="button"
          data-testid="sun-mode"
          data-mode={sunMode}
          aria-label={`Scene light: ${SUN_MODE_LABEL[sunMode]}. Tap to switch to ${SUN_MODE_LABEL[otherSunMode(sunMode)]}.`}
          onClick={() => {
            onSunMode(otherSunMode(sunMode));
          }}
          className="wl-plate inline-flex min-h-11 items-center rounded-md px-4 text-hud-sm font-medium text-text-secondary transition-colors duration-200 ease-out hover:text-text"
        >
          {SUN_MODE_LABEL[sunMode]}
        </button>
      </div>
      <p className="wl-plate wl-hud-text rounded-pill max-w-[min(38rem,80vw)] px-3 py-1 text-hud-sm leading-snug text-text-secondary">
        {START_CAPTION[gps]}
      </p>
    </div>
  );
}
