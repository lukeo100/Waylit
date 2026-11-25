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
  "min-h-11 min-w-11 rounded-sm border px-2 font-semibold transition-colors duration-200 ease-out";
const BUTTON_ON = `${BUTTON} border-cyan bg-cyan text-night-950`;
const BUTTON_OFF = `${BUTTON} border-glass-border bg-night-800 text-text`;

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
 * - Playback speed changes how fast the simulated ride runs.
 * - "Lose scooter data" stops scooter telemetry, so the GPS fallback can be seen.
 * - The Time button opens the time controls. They override the date and time the HUD works
 *   from, so day, sunset and night can be shown at any hour. Live goes back to the real clock.
 *   The Dawn, Noon, Sunset and Night buttons jump to those moments at the rider's place on the
 *   chosen date. The slider and the date field use the device's own time zone, like the HUD
 *   clock. Closing the Time row also goes back to the real clock.
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
  // The time row starts folded away, so the panel stays as small as it was. It opens when a
  // developer asks for it, and it is open whenever a time override is in force.
  const [open, setOpen] = useState(false);
  const expanded = open || overridden;

  return (
    <aside
      aria-label="Simulation dev controls"
      data-testid="dev-controls"
      className="wl-glass pointer-events-auto flex max-w-full flex-col items-center gap-y-1 rounded-md px-2 py-1 text-hud-sm text-text-secondary"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
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
        <label className="flex min-h-11 items-center gap-1.5 text-text">
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
          aria-expanded={expanded}
          aria-controls="dev-time-override"
          data-testid="time-toggle"
          onClick={() => {
            if (expanded) {
              // Folding the time row puts the HUD back on the real clock.
              setOpen(false);
              onTimeOverride(undefined);
            } else {
              setOpen(true);
            }
          }}
          className={expanded ? BUTTON_ON : BUTTON_OFF}
        >
          Time
        </button>
      </div>

      {expanded ? (
        <div
          id="dev-time-override"
          role="group"
          aria-label="Time of day override"
          data-testid="time-override"
          data-overridden={overridden}
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
        >
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
          <label className="flex min-h-11 items-center gap-1.5 text-text">
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
              className="h-11 w-[clamp(6rem,18vw,11rem)] accent-cyan"
            />
          </label>
          <label className="flex min-h-11 items-center gap-1.5 text-text">
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
          <span data-testid="time-readout" className="text-text tabular-nums">
            {formatClockTime(daylight.nowMs === 0 ? undefined : daylight.nowMs)} ·{" "}
            {PHASE_LABEL[daylight.solar.phase]} · sun {Math.round(daylight.solar.elevationDegrees)}°
          </span>
        </div>
      ) : null}
    </aside>
  );
}
