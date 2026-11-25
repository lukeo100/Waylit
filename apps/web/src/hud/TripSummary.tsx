import { formatDuration, formatTripDistance } from "@waylit/core";
import type { TripSummary as TripSummaryData } from "@/ride/ride-session";

interface TripSummaryProps {
  readonly summary: TripSummaryData;
  readonly onStartNew: () => void;
}

/** Shown after End trip: distance, duration and average speed, and a way to start again. */
export function TripSummary({ summary, onStartNew }: TripSummaryProps) {
  const distance = formatTripDistance(summary.distanceMetres);
  const average = Math.round(summary.averageSpeedKmh);

  return (
    <div className="absolute inset-0 z-30 grid place-items-center px-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-summary-title"
        data-testid="trip-summary"
        className="wl-glass flex w-full max-w-md flex-col gap-3 p-5 short:gap-2 short:p-4"
      >
        <h1 id="trip-summary-title" className="text-xl font-semibold text-text">
          Trip complete
        </h1>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <SummaryStat
            label="Distance"
            value={`${distance.value} ${distance.unit}`}
            testId="summary-distance"
          />
          <SummaryStat
            label="Duration"
            value={formatDuration(summary.durationSeconds)}
            testId="summary-duration"
          />
          <SummaryStat
            label="Average speed"
            value={`${average} km/h`}
            testId="summary-average-speed"
          />
        </dl>
        {summary.distanceSource !== "vehicle" ? (
          <p data-testid="summary-note" className="text-xs leading-snug text-text-secondary">
            {summary.distanceSource === "gps"
              ? "Distance was counted from GPS because scooter data was not available."
              : "Part of the distance was counted from GPS while scooter data was not available."}
          </p>
        ) : null}
        <button
          type="button"
          autoFocus
          onClick={onStartNew}
          data-testid="start-new-trip"
          className="inline-flex min-h-14 items-center justify-center rounded-md bg-volt px-6 text-lg font-bold text-night-950 shadow-glow-volt transition-colors duration-200 ease-out hover:bg-volt-soft"
        >
          Start new trip
        </button>
      </section>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}) {
  return (
    <div className="rounded-md bg-night-900/60 px-2 py-2">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd data-testid={testId} className="text-xl font-bold text-text tabular-nums short:text-lg">
        {value}
      </dd>
    </div>
  );
}
