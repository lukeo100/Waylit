import {
  formatDistance,
  formatDuration,
  formatSpeedKmh,
  type NavigationProgress,
  type SpeedSource,
} from "@waylit/core";
import type { SelectedSpeed } from "@waylit/vehicle";
import { ManoeuvreIcon } from "./icons";
import { formatClockTime } from "./time";

interface NavigationPanelProps {
  readonly speed: SelectedSpeed;
  readonly progress: NavigationProgress;
  readonly riding: boolean;
}

const SOURCE_LABEL: Record<SpeedSource, string> = { vehicle: "Scooter", gps: "GPS" };

/**
 * Top left: the speed, the next turn and how much of the trip is left. The speed is the
 * largest thing on the screen. It comes from the scooter when telemetry is live and falls back
 * to GPS when it is not, and the small tag says which.
 */
export function NavigationPanel({ speed, progress, riding }: NavigationPanelProps) {
  const speedValue = formatSpeedKmh(speed.speedMps);
  const turn = progress.nextInstruction;
  const toTurn = formatDistance(progress.distanceToNextMetres);
  const remaining = formatDistance(progress.remainingDistanceMetres);
  const fallback = speed.source === "gps" && speed.fallbackReason !== undefined;

  return (
    <section
      aria-label="Navigation"
      data-testid="navigation-panel"
      className="wl-glass @container flex flex-col gap-2 p-3 short:gap-1.5 short:p-2.5"
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span
            data-testid="speed-value"
            aria-label={`Speed ${speedValue.value} kilometres per hour`}
            className="text-display leading-none font-bold tracking-display text-text tabular-nums short:text-display-sm"
          >
            {speedValue.value}
          </span>
          <span className="mt-0.5 flex items-baseline gap-1.5 text-xs font-medium whitespace-nowrap">
            <span className="text-text-secondary">{speedValue.unit}</span>
            {speed.source !== undefined ? (
              <span
                data-testid="speed-source"
                className={fallback ? "text-caution" : "text-text-secondary"}
              >
                {fallback ? "GPS fallback" : SOURCE_LABEL[speed.source]}
              </span>
            ) : null}
          </span>
        </div>

        <div
          data-testid="next-turn"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-glass-border bg-night-900/70 px-1.5 py-1.5"
        >
          {turn ? (
            <>
              <span className="size-8 shrink-0 text-cyan-soft @[16rem]:size-9">
                <ManoeuvreIcon manoeuvre={turn.manoeuvre} size="100%" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  data-testid="turn-distance"
                  className="text-xl leading-tight font-bold whitespace-nowrap text-text tabular-nums @[16rem]:text-2xl"
                >
                  {toTurn.value}
                  <span className="ml-1 text-sm font-medium text-text-secondary">
                    {toTurn.unit}
                  </span>
                </p>
                <p className="line-clamp-2 text-sm leading-snug font-medium text-text-secondary">
                  {turn.text}
                </p>
              </div>
            </>
          ) : (
            <p className="px-1 text-sm text-text-secondary">No instructions</p>
          )}
        </div>
      </div>

      <dl className="flex justify-between gap-2 text-center">
        <Stat
          label="Arrive"
          value={
            riding && progress.etaTimestamp !== undefined
              ? formatClockTime(progress.etaTimestamp)
              : "--:--"
          }
          testId="stat-eta"
        />
        <Stat
          label="To go"
          value={`${remaining.value} ${remaining.unit}`}
          testId="stat-remaining-distance"
        />
        <Stat
          label="Time left"
          value={formatDuration(progress.remainingDurationSeconds)}
          testId="stat-remaining-time"
        />
      </dl>
    </section>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}) {
  return (
    <div className="rounded-md bg-night-900/50 px-2 py-1">
      <dt className="text-xs leading-snug whitespace-nowrap text-text-secondary">{label}</dt>
      <dd
        data-testid={testId}
        className="text-base leading-snug font-semibold whitespace-nowrap text-text tabular-nums"
      >
        {value}
      </dd>
    </div>
  );
}
