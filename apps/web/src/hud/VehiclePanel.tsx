"use client";

import { useState, type ReactNode } from "react";
import { formatDistance, formatPercent, formatRange, formatStopwatch } from "@waylit/core";
import type { TripReading, VehicleTelemetry } from "@waylit/vehicle";
import { HOLD_TO_END_MS } from "@/ride/guard";
import { HoldButton } from "./HoldButton";
import { BatteryIcon } from "./icons";

interface VehiclePanelProps {
  /** Live telemetry, or undefined when none has arrived or it has gone stale. */
  readonly telemetry: VehicleTelemetry | undefined;
  readonly trip: TripReading;
  readonly guarded: boolean;
  readonly riding: boolean;
  readonly onEndTrip: () => void;
}

const LOW_BATTERY_PERCENT = 20;

/**
 * Right half of the dock: the vehicle dashboard. Battery with its percent, estimated range,
 * trip distance and time, and the End trip button at the far right. Speed is not repeated here,
 * because it is the big number top left. When the scooter stops sending data the battery and
 * range show dashes, and the trip counters carry on from GPS (the note for that is under the
 * speed).
 *
 * End trip is the only red on the screen: a dark red fill, a muted red outline and soft red
 * text. Above the guard speed it needs a hold, and its caption says so.
 */
export function VehiclePanel({ telemetry, trip, guarded, riding, onEndTrip }: VehiclePanelProps) {
  const battery = formatPercent(telemetry?.batteryPercent);
  const range = formatRange(telemetry?.rangeMetres);
  const distance = formatDistance(trip.distanceMetres);
  const batteryPercent = telemetry?.batteryPercent;
  const low = batteryPercent !== undefined && batteryPercent <= LOW_BATTERY_PERCENT;
  const [holding, setHolding] = useState(false);
  const endHolding = guarded && holding;
  const endLabel = endHolding ? "Keep holding" : guarded ? "Hold to end" : "End trip";

  return (
    <section
      aria-label="Vehicle dashboard"
      data-testid="vehicle-panel"
      className="flex min-w-0 items-center justify-between gap-[clamp(0.3rem,0.8vw,1.1rem)] px-[clamp(0.4rem,1vw,1rem)] py-[clamp(0.25rem,1.4dvh,0.6rem)]"
    >
      <div className="flex min-w-0 items-center gap-[clamp(0.3rem,0.8vw,1.1rem)]">
        <div className="flex items-center gap-1">
          <span
            className={`size-[clamp(1.1rem,5.2dvh,1.75rem)] shrink-0 ${low ? "text-caution" : "text-text-secondary"}`}
          >
            <BatteryIcon percent={batteryPercent} low={low} size="100%" />
          </span>
          <p
            data-testid="battery-value"
            className={`text-hud-dock leading-none font-semibold whitespace-nowrap tabular-nums ${low ? "text-caution" : "text-text"}`}
          >
            {battery.value}
            <span className="text-hud-sm font-medium text-text-secondary">{battery.unit}</span>
          </p>
        </div>
        <Stat label="Range" testId="range-value">
          {range.value} <span className="text-hud-sm font-medium">{range.unit}</span>
        </Stat>
        <Stat label="Trip" testId="trip-value">
          <span data-testid="trip-distance">
            {distance.value} <span className="text-hud-sm font-medium">{distance.unit}</span>
          </span>
          <span aria-hidden="true" className="px-[0.3em] text-text-muted">
            &middot;
          </span>
          <span data-testid="trip-duration">{formatStopwatch(trip.durationSeconds)}</span>
        </Stat>
      </div>

      <HoldButton
        label="End trip"
        guarded={guarded}
        holdMs={HOLD_TO_END_MS}
        feedback="fill"
        onHoldChange={setHolding}
        onActivate={onEndTrip}
        className={`min-h-11 min-w-[clamp(5.25rem,12.5vw,8rem)] shrink-0 rounded-md border border-danger-border bg-danger-fill px-[clamp(0.4rem,1vw,1rem)] text-hud-md leading-tight font-semibold whitespace-nowrap text-danger transition-colors duration-200 ease-out data-[holding=true]:border-danger data-[holding=true]:bg-danger/25 ${riding ? "" : "pointer-events-none opacity-40"}`}
        data-testid="end-trip"
      >
        {endLabel}
      </HoldButton>
    </section>
  );
}

function Stat({
  label,
  testId,
  children,
}: {
  readonly label: string;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-w-0 leading-none">
      <p
        data-testid={testId}
        className="text-hud-dock leading-none font-semibold whitespace-nowrap text-text tabular-nums"
      >
        {children}
      </p>
      <p className="mt-[0.5dvh] text-hud-sm leading-none text-text-muted">{label}</p>
    </div>
  );
}
