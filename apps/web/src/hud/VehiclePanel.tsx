import {
  formatPercent,
  formatRange,
  formatSpeedKmh,
  formatStopwatch,
  formatTripDistance,
} from "@waylit/core";
import type { TripReading, VehicleTelemetry } from "@waylit/vehicle";
import { HOLD_TO_END_MS } from "@/ride/guard";
import { HoldButton } from "./HoldButton";

interface VehiclePanelProps {
  /** Live telemetry, or undefined when none has arrived or it has gone stale. */
  readonly telemetry: VehicleTelemetry | undefined;
  readonly trip: TripReading;
  /** GPS speed, shown on its own next to the scooter's. */
  readonly gpsSpeedMps: number | undefined;
  readonly guarded: boolean;
  readonly riding: boolean;
  readonly onEndTrip: () => void;
}

const LOW_BATTERY_PERCENT = 20;

/**
 * Bottom right: the vehicle dashboard. Battery with a bar, estimated range, trip distance and
 * time, and the scooter's own speed shown apart from GPS speed. It ends with the End trip
 * button. When the scooter stops sending data the battery, range and scooter speed show
 * dashes, and the trip counters carry on from GPS, with a note saying so.
 */
export function VehiclePanel({
  telemetry,
  trip,
  gpsSpeedMps,
  guarded,
  riding,
  onEndTrip,
}: VehiclePanelProps) {
  const battery = formatPercent(telemetry?.batteryPercent);
  const range = formatRange(telemetry?.rangeMetres);
  const scooterSpeed = formatSpeedKmh(telemetry?.speedMps);
  const gpsSpeed = formatSpeedKmh(gpsSpeedMps);
  const distance = formatTripDistance(trip.distanceMetres);
  const batteryPercent = telemetry?.batteryPercent;
  const low = batteryPercent !== undefined && batteryPercent <= LOW_BATTERY_PERCENT;
  const gpsTrip = trip.distanceSource === "gps" && trip.distanceFallbackReason !== undefined;

  return (
    <section
      aria-label="Vehicle dashboard"
      data-testid="vehicle-panel"
      className="wl-glass flex flex-col gap-2 p-3 short:gap-1.5 short:p-2.5"
    >
      <div className="flex items-center gap-2">
        <p
          data-testid="battery-value"
          className={`min-w-[3.25rem] text-xl leading-none font-bold tabular-nums ${low ? "text-caution" : "text-text"}`}
        >
          {battery.value}
          <span className="text-sm font-medium text-text-secondary">{battery.unit}</span>
        </p>
        <div
          role="progressbar"
          aria-label="Battery"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={batteryPercent === undefined ? undefined : Math.round(batteryPercent)}
          className="h-3 min-w-0 flex-1 overflow-hidden rounded-pill bg-night-700"
        >
          <div
            data-testid="battery-bar"
            className={`h-full rounded-pill ${low ? "bg-caution" : "bg-ok"}`}
            style={{ width: `${batteryPercent === undefined ? 0 : Math.round(batteryPercent)}%` }}
          />
        </div>
        <p
          data-testid="range-value"
          className="text-sm font-semibold whitespace-nowrap text-text tabular-nums"
        >
          {range.value} <span className="font-medium text-text-secondary">{range.unit} range</span>
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-stretch gap-2">
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
          <Stat label="Trip" value={distance.value} unit={distance.unit} testId="trip-distance" />
          <Stat label="Time" value={formatStopwatch(trip.durationSeconds)} testId="trip-duration" />
          <Stat
            label="Scooter"
            value={scooterSpeed.value}
            unit={scooterSpeed.unit}
            testId="vehicle-speed"
          />
          <Stat label="GPS" value={gpsSpeed.value} unit={gpsSpeed.unit} testId="gps-speed" />
        </dl>
        <HoldButton
          label="End trip"
          guarded={guarded}
          holdMs={HOLD_TO_END_MS}
          onActivate={onEndTrip}
          hint={{ idle: "Hold", holding: "Keep holding" }}
          className={`min-h-12 flex-col rounded-md bg-danger px-2 text-base leading-tight font-bold text-night-950 shadow-[0_0_18px_rgba(255,90,107,0.35)] transition-colors duration-200 ease-out hover:bg-danger/90 ${riding ? "" : "pointer-events-none opacity-40"}`}
          data-testid="end-trip"
        >
          End trip
        </HoldButton>
      </div>

      {telemetry === undefined && riding ? (
        <p data-testid="telemetry-note" className="text-xs leading-snug text-caution">
          No scooter data. {gpsTrip ? "Trip distance from GPS." : "Using GPS."}
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly testId: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-snug text-text-secondary">{label}</dt>
      <dd
        data-testid={testId}
        className="text-base leading-snug font-semibold whitespace-nowrap text-text tabular-nums"
      >
        {value}
        {unit ? (
          <span className="ml-0.5 text-xs font-medium text-text-secondary">{unit}</span>
        ) : null}
      </dd>
    </div>
  );
}
