"use client";

import { useState } from "react";
import type { LatLng } from "@waylit/core";
import { PLAYBACK_SPEEDS } from "./dev-controls";
import {
  TIME_PRESETS,
  localDateString,
  localMinutesOfDay,
  presetInstant,
  withLocalDate,
  withLocalMinutes,
  type DaylightState,
  type TimePreset,
} from "./daylight";
import { formatClockTime } from "./time";

interface DevControlsProps {
  readonly playbackSpeed: number;
  readonly telemetryLost: boolean;
  readonly onPlaybackSpeed: (multiplier: number) => void;
  readonly onTelemetryLost: (lost: boolean) => void;
  /** The daylight now, with the override applied, for the readout. */
  readonly daylight: DaylightState;
  /** The real time, which presets and the date field start from when nothing is overridden. */
  readonly realNowMs: number | undefined;
  /** The place the sun is worked out for. */
  readonly position: LatLng;
  /** The overridden time, or undefined while the HUD follows the real clock. */
  readonly timeOverrideMs: number | undefined;
  readonly onTimeOverride: (ms: number | undefined) => void;
}

/** At least 44 by 44 pixels, like every other touch target. */
const BUTTON =
  "min-h-11 min-w-11 shrink-0 rounded-sm border px-2 font-semibold transition-colors duration-200 ease-out";
const BUTTON_ON = `${BUTTON} border-cyan bg-cyan text-night-950`;
const BUTTON_OFF = `${BUTTON} border-glass-border bg-night-800 text-text`;

/** One line, never wrapped. It scrolls sideways when the screen is narrower than the row. */
const ROW =
  "flex w-max max-w-full min-w-0 flex-nowrap items-center gap-x-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const PRESET_LABEL: Record<TimePreset, string> = {
  dawn: "Dawn",
  noon: "Noon",
  sunset: "Sunset",
  night: "Night",
};

const PHASE_LABEL = {
  day: "day",
  "golden-hour": "golden hour",
  "civil-twilight": "civil twilight",
  "nautical-twilight": "nautical twilight",
  night: "night",
} as const;

/**
 * Developer controls for the simulation. They are hidden in production builds unless the
 * address has `?dev=1`.
 *
 * The panel is always exactly one row tall, so it can sit under the Start trip button on the
 * shortest landscape screens without covering the navigation text. It has two pages and the
 * Time button switches between them:
 *
 * - The simulation page: playback speed, and "Lose scooter data", which stops scooter
 *   telemetry so the GPS fallback can be seen.
 * - The time page: it overrides the date and time the HUD works from, so day, sunset and night
 *   can be shown at any hour. Live goes back to the real clock. The Dawn, Noon, Sunset and
 *   Night buttons jump to those moments at the rider's place on the chosen date. The slider
 *   and the date field use the device's own time zone, like the HUD clock.
 *
 * Going back to the simulation page keeps the override, and the Time button stays filled while
 * one is in force. Only Live (or leaving the dev controls) returns to the real clock. A row
 * that is wider than the screen scrolls sideways instead of wrapping onto a second line.
 */
export function DevControls({
  playbackSpeed,
  telemetryLost,
  onPlaybackSpeed,
  onTelemetryLost,
  daylight,
  realNowMs,
  position,
  timeOverrideMs,
  onTimeOverride,
}: DevControlsProps) {
  const baseMs = timeOverrideMs ?? realNowMs;
  const overridden = timeOverrideMs !== undefined;
  // The panel opens on the time page when the address already carries a time override.
  const [timePage, setTimePage] = useState(overridden);

  return (
    <aside
      aria-label="Simulation dev controls"
      data-testid="dev-controls"
      className="wl-glass pointer-events-auto flex max-w-full rounded-md px-2 py-1 text-hud-sm text-text-secondary"
    >
      {timePage ? (
        <div
          id="dev-time-override"
          role="group"
          aria-label="Time of day override"
          data-testid="time-override"
          data-overridden={overridden}
          className={ROW}
        >
          <button
            type="button"
            aria-expanded
            aria-controls="dev-time-override"
            data-testid="time-toggle"
            onClick={() => {
              setTimePage(false);
            }}
            className={BUTTON_OFF}
          >
            Back
          </button>
          <button
            type="button"
            aria-pressed={!overridden}
            onClick={() => {
              onTimeOverride(undefined);
            }}
            className={overridden ? BUTTON_OFF : BUTTON_ON}
          >
            Live
          </button>
          {TIME_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              data-testid={`time-${preset}`}
              disabled={baseMs === undefined}
              onClick={() => {
                if (baseMs !== undefined) onTimeOverride(presetInstant(preset, position, baseMs));
              }}
              className={`${BUTTON_OFF} disabled:opacity-50`}
            >
              {PRESET_LABEL[preset]}
            </button>
          ))}
          <label className="flex min-h-11 shrink-0 items-center gap-1.5 text-text">
            <span className="sr-only">Time of day</span>
            <input
              type="range"
              min={0}
              max={1439}
              step={5}
              data-testid="time-slider"
              disabled={baseMs === undefined}
              value={baseMs === undefined ? 0 : localMinutesOfDay(baseMs)}
              onChange={(event) => {
                if (baseMs !== undefined) {
                  onTimeOverride(withLocalMinutes(baseMs, Number(event.target.value)));
                }
              }}
              className="h-11 w-[clamp(3.5rem,8vw,11rem)] accent-cyan"
            />
          </label>
          <label className="flex min-h-11 shrink-0 items-center gap-1.5 text-text">
            <span className="sr-only">Date</span>
            <input
              type="date"
              data-testid="time-date"
              disabled={baseMs === undefined}
              value={baseMs === undefined ? "" : localDateString(baseMs)}
              onChange={(event) => {
                if (baseMs !== undefined) {
                  onTimeOverride(withLocalDate(baseMs, event.target.value));
                }
              }}
              className="min-h-11 rounded-sm border border-glass-border bg-night-800 px-1.5 text-text"
            />
          </label>
          <span data-testid="time-readout" className="shrink-0 text-text tabular-nums">
            {formatClockTime(daylight.clockMs === 0 ? undefined : daylight.clockMs)} ·{" "}
            {PHASE_LABEL[daylight.solar.phase]} · sun {Math.round(daylight.solar.elevationDegrees)}°
          </span>
        </div>
      ) : (
        <div role="group" aria-label="Simulation" data-testid="sim-controls" className={ROW}>
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
                className={playbackSpeed === multiplier ? BUTTON_ON : BUTTON_OFF}
              >
                {multiplier}x
              </button>
            ))}
          </span>
          <label className="flex min-h-11 shrink-0 items-center gap-1.5 text-text">
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
          <button
            type="button"
            aria-expanded={false}
            aria-controls="dev-time-override"
            data-testid="time-toggle"
            data-overridden={overridden}
            onClick={() => {
              setTimePage(true);
            }}
            className={overridden ? BUTTON_ON : BUTTON_OFF}
          >
            Time
          </button>
        </div>
      )}
    </aside>
  );
}
