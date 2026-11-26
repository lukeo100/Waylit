import {
  formatDistance,
  formatDuration,
  formatSpeedKmh,
  turnPhase,
  type NavigationProgress,
} from "@waylit/core";
import type { SelectedSpeed } from "@waylit/vehicle";
import { ManoeuvreIcon, OfflineIcon } from "./icons";
import { formatClockTime } from "./time";

interface NavigationPanelProps {
  readonly speed: SelectedSpeed;
  /** GPS speed, shown on its own under the headline speed. */
  readonly gpsSpeedMps: number | undefined;
  readonly progress: NavigationProgress;
  readonly riding: boolean;
  /** Shown under the speed, in amber with a small icon, when the scooter has stopped sending data. */
  readonly note?: string | undefined;
  /**
   * The overridden time, only while the dev time override is on. The arrival time is then the
   * overridden time plus the time left, so it agrees with the clock the rider is shown.
   */
  readonly simulatedNowMs?: number | undefined;
  /**
   * True for a free ride (live GPS, no route). There is no turn, ETA or distance left to show,
   * so the turn column says so in plain words instead.
   */
  readonly freeRide?: boolean | undefined;
}

/**
 * Top left: the speed and the next turn, bare on the scene. There is no plate, fill, border or
 * scrim behind it: a small shadow that follows the glyphs (`wl-hud-shadow` for text, `wl-hud-icon`
 * for the arrow and the icons) keeps it readable, so the scene stays clear. The speed comes from
 * the scooter when telemetry is live and falls back to GPS when it is not. GPS speed is always
 * shown separately under the number.
 *
 *   speed column   the speed as a large bare number, then `km/h` and `GPS 17` in small type
 *   turn column    the turn arrow and the distance to it, the street instruction, then the time
 *                  and distance left and the arrival time on one quiet line
 *
 * The turn arrow turns cyan when the turn is imminent. Every colour here is one that passes WCAG
 * AA at the glyph edge over pure white with the shadow (see readability.ts).
 */
export function NavigationPanel({
  speed,
  gpsSpeedMps,
  progress,
  riding,
  note,
  simulatedNowMs,
  freeRide = false,
}: NavigationPanelProps) {
  const speedValue = formatSpeedKmh(speed.speedMps);
  const gpsValue = formatSpeedKmh(gpsSpeedMps);
  const turn = progress.nextInstruction;
  const toTurn = formatDistance(progress.distanceToNextMetres);
  const remaining = formatDistance(progress.remainingDistanceMetres);
  const fallback = speed.source === "gps" && speed.fallbackReason !== undefined;
  const arrivalMs =
    simulatedNowMs !== undefined && progress.remainingDurationSeconds !== undefined
      ? simulatedNowMs + progress.remainingDurationSeconds * 1000
      : progress.etaTimestamp;
  const arrival = riding && arrivalMs !== undefined ? formatClockTime(arrivalMs) : "--:--";
  const phase =
    riding && progress.distanceToNextMetres !== undefined
      ? turnPhase(progress.distanceToNextMetres)
      : "far";

  return (
    <section
      aria-label="Navigation"
      data-testid="navigation-panel"
      className="wl-hud-shadow wl-enter flex max-w-full min-w-0 items-stretch"
    >
      <div className="flex shrink-0 flex-col justify-center py-[clamp(0.35rem,1.8dvh,0.8rem)] pr-[clamp(0.6rem,1.3vw,1rem)] pl-[clamp(0.65rem,1.4vw,1.1rem)]">
        <span
          data-testid="speed-value"
          aria-label={`Speed ${speedValue.value} kilometres per hour`}
          className="block min-w-[2ch] text-speed leading-[0.84] font-medium tracking-speed text-text tabular-nums"
        >
          {speedValue.value}
        </span>
        <span className="mt-[clamp(0.2rem,1.2dvh,0.5rem)] flex items-baseline gap-[0.7em] text-hud-sm leading-none font-medium whitespace-nowrap">
          <span data-testid="speed-unit" className="text-text-secondary">
            {speedValue.unit}
          </span>
          <span
            data-testid="speed-source"
            data-fallback={fallback}
            className={fallback ? "font-semibold text-caution" : "text-text-secondary"}
          >
            GPS {gpsValue.value}
          </span>
        </span>
        {note ? (
          <p
            data-testid="telemetry-note"
            className="mt-[0.8dvh] flex max-w-[16ch] items-start gap-[0.4em] text-hud-sm leading-snug text-caution"
          >
            <span className="wl-hud-icon mt-[0.15em] size-[1.1em] shrink-0">
              <OfflineIcon size="100%" />
            </span>
            <span>{note}</span>
          </p>
        ) : null}
      </div>

      {/* A 1 pixel spacer where the divider of the old plate was, so the spacing is unchanged. */}
      <div aria-hidden="true" className="w-px shrink-0" />

      <div
        data-testid="next-turn"
        data-phase={phase}
        className="flex min-w-0 flex-col justify-center gap-[clamp(0.15rem,0.9dvh,0.35rem)] py-[clamp(0.35rem,1.8dvh,0.8rem)] pr-[clamp(0.7rem,1.5vw,1.2rem)] pl-[clamp(0.6rem,1.3vw,1rem)]"
      >
        {freeRide ? (
          <>
            <p
              data-testid="free-ride"
              className="text-hud-turn leading-none font-semibold tracking-display whitespace-nowrap text-text"
            >
              Free ride
            </p>
            <p className="max-w-[17ch] text-hud-md leading-snug font-medium text-text-secondary">
              No route. Speed, distance and time come from GPS.
            </p>
          </>
        ) : turn ? (
          <>
            <div className="flex items-center gap-[clamp(0.3rem,0.9vw,0.6rem)]">
              <span
                data-testid="turn-arrow"
                data-phase={phase}
                className="wl-turn-arrow wl-hud-icon size-[clamp(1.6rem,8dvh,2.6rem)] shrink-0"
              >
                <ManoeuvreIcon manoeuvre={turn.manoeuvre} size="100%" />
              </span>
              <p
                data-testid="turn-distance"
                className="text-hud-turn leading-none font-semibold tracking-display whitespace-nowrap text-text tabular-nums"
              >
                {toTurn.value}
                <span className="ml-[0.18em] text-hud-md font-medium tracking-normal text-text-secondary">
                  {toTurn.unit}
                </span>
              </p>
            </div>
            <p
              data-testid="turn-instruction"
              className="line-clamp-2 max-w-[17ch] text-hud-md leading-snug font-medium text-text"
            >
              {turn.text}
            </p>
          </>
        ) : (
          <p className="text-hud-md text-text-secondary">No instructions</p>
        )}
        {freeRide ? null : (
          <p className="flex items-baseline gap-[0.5em] text-hud-sm leading-tight whitespace-nowrap text-text-secondary tabular-nums">
            <span data-testid="stat-remaining">
              {formatDuration(progress.remainingDurationSeconds)}
              <span aria-hidden="true"> &middot; </span>
              <span className="sr-only">, </span>
              {remaining.value} {remaining.unit}
            </span>
            <span aria-hidden="true">&middot;</span>
            <span data-testid="stat-eta">Arrive {arrival}</span>
          </p>
        )}
      </div>
    </section>
  );
}
