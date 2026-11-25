import {
  formatDistance,
  formatDuration,
  formatSpeedKmh,
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
}

/**
 * Top left, with no card around it: the vehicle speed as one huge bare number, then the next
 * turn beside it. The speed comes from the scooter when telemetry is live and falls back to GPS
 * when it is not. GPS speed is always shown separately under the number.
 *
 * Under the speed sit the unit and "GPS 17". Beside it the turn arrow, the distance to the turn,
 * the street instruction, then a quieter grey line with the time and distance left, and the
 * arrival time.
 */
export function NavigationPanel({
  speed,
  gpsSpeedMps,
  progress,
  riding,
  note,
  simulatedNowMs,
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

  return (
    <section
      aria-label="Navigation"
      data-testid="navigation-panel"
      className="flex min-w-0 items-start gap-[clamp(0.75rem,3.2vw,2.75rem)]"
    >
      <div className="flex shrink-0 flex-col">
        <span
          data-testid="speed-value"
          aria-label={`Speed ${speedValue.value} kilometres per hour`}
          className="block min-w-[2ch] text-speed leading-[0.82] font-medium tracking-speed text-text tabular-nums"
        >
          {speedValue.value}
        </span>
        <span className="mt-[1.6dvh] flex items-baseline gap-[0.8em] text-hud-md leading-none font-medium whitespace-nowrap">
          <span data-testid="speed-unit" className="text-text-secondary">
            {speedValue.unit}
          </span>
          <span
            data-testid="speed-source"
            data-fallback={fallback}
            className={fallback ? "font-semibold text-caution" : "text-text-muted"}
          >
            GPS {gpsValue.value}
          </span>
        </span>
        {note ? (
          <p
            data-testid="telemetry-note"
            className="mt-[1dvh] flex max-w-[18ch] items-start gap-[0.4em] text-hud-sm leading-snug text-caution"
          >
            <span className="mt-[0.15em] size-[1.1em] shrink-0">
              <OfflineIcon size="100%" />
            </span>
            <span>{note}</span>
          </p>
        ) : null}
      </div>

      <div
        data-testid="next-turn"
        className="flex min-w-0 flex-1 flex-col gap-[0.9dvh] pt-[clamp(0.25rem,3dvh,1.5rem)]"
      >
        {turn ? (
          <>
            <div className="flex items-center gap-[clamp(0.4rem,1.2vw,0.9rem)]">
              <span className="size-[clamp(2rem,10.5dvh,3.75rem)] shrink-0 text-text">
                <ManoeuvreIcon manoeuvre={turn.manoeuvre} size="100%" />
              </span>
              <p
                data-testid="turn-distance"
                className="text-hud-turn leading-none font-semibold whitespace-nowrap text-text tabular-nums"
              >
                {toTurn.value}
                <span className="ml-[0.2em] text-hud-lg font-medium text-text-secondary">
                  {toTurn.unit}
                </span>
              </p>
            </div>
            <p
              data-testid="turn-instruction"
              className="line-clamp-2 max-w-[19ch] text-hud-lg leading-snug font-medium text-text-secondary"
            >
              {turn.text}
            </p>
          </>
        ) : (
          <p className="text-hud-lg text-text-secondary">No instructions</p>
        )}
        <p
          data-testid="stat-remaining"
          className="text-hud-md leading-snug whitespace-nowrap text-text-muted tabular-nums"
        >
          {formatDuration(progress.remainingDurationSeconds)}
          <span aria-hidden="true"> &middot; </span>
          <span className="sr-only">, </span>
          {remaining.value} {remaining.unit}
        </p>
        <p
          data-testid="stat-eta"
          className="text-hud-sm leading-none whitespace-nowrap text-text-muted tabular-nums"
        >
          Arrive {arrival}
        </p>
      </div>
    </section>
  );
}
