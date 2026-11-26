"use client";

import { useId } from "react";
import type { VehicleController, VehicleSnapshot } from "@/vehicle/vehicle-controller";
import {
  VEHICLE_TEXT as TEXT,
  describeVehicleStatus,
  vehicleActions,
  type StatusTone,
  type VehicleChoice,
} from "@/vehicle/vehicle-settings";
import { Segmented } from "./MapSettings";

const TARGET = "min-h-11 min-w-11";

const TONE_CLASS: Record<StatusTone, string> = {
  quiet: "text-text-muted",
  ok: "text-text-secondary",
  attention: "text-caution",
  error: "text-danger",
};

interface VehicleSettingsProps {
  readonly snapshot: VehicleSnapshot;
  readonly controller: VehicleController;
  /** True while the speed guard is on (above 8 km/h): connecting is switched off. */
  readonly guarded: boolean;
}

/**
 * The Vehicle section of the settings sheet. Mock is the default and needs nothing. MAX G3
 * (Bluetooth) shows a quiet state line, a Connect button that runs straight from the tap (the
 * browser only shows the Bluetooth chooser from a tap), and plain notes: reads only, keep the
 * screen on, close the official app, pairing is unverified. Amber means something needs
 * attention, red only a real error, and a browser that cannot do Bluetooth gets a plain message
 * and a disabled button.
 */
export function VehicleSettings({ snapshot, controller, guarded }: VehicleSettingsProps) {
  const choiceNote = useId();
  const statusId = useId();
  const real = snapshot.mode !== "mock";
  const simulated = snapshot.mode === "g3sim";
  const status = describeVehicleStatus(snapshot.status);
  const actions = vehicleActions(snapshot.status, guarded);
  const connected = snapshot.status.state === "connected";
  const choice: VehicleChoice = real ? "g3" : "mock";

  return (
    <section
      data-testid="vehicle-settings"
      aria-label={TEXT.title}
      className="flex flex-col gap-2 border-t border-glass-border pt-3"
    >
      <Segmented<VehicleChoice>
        label={TEXT.choiceLabel}
        options={[
          { value: "mock", label: TEXT.mockOption },
          { value: "g3", label: TEXT.g3Option },
        ]}
        value={choice}
        disabled={snapshot.lockedByAddress}
        describedBy={choiceNote}
        testId="vehicle-choice"
        onChange={(value) => {
          controller.setChoice(value);
        }}
      />
      <div id={choiceNote} className="flex flex-col gap-1 text-hud-sm leading-snug text-text-muted">
        {snapshot.lockedByAddress ? <p data-testid="vehicle-locked">{TEXT.locked}</p> : null}
        {simulated ? <p data-testid="vehicle-sim">{TEXT.simulator}</p> : null}
        {!real ? <p data-testid="vehicle-mock-note">{TEXT.mockNote}</p> : null}
      </div>

      {real ? (
        <>
          <p
            id={statusId}
            role="status"
            data-testid="vehicle-status"
            data-state={snapshot.status.state}
            data-tone={status.tone}
            className={`text-hud-sm leading-snug ${TONE_CLASS[status.tone]}`}
          >
            {status.text}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="vehicle-connect"
              disabled={actions.connectDisabled}
              aria-describedby={statusId}
              onClick={() => {
                // Called in this turn, so the browser still counts it as the rider's tap.
                void (connected ? controller.disconnect() : controller.connect());
              }}
              className={`${TARGET} touch-manipulation rounded-md border px-3 text-hud-sm font-medium transition-colors duration-200 ease-out ${
                actions.connectDisabled
                  ? "cursor-not-allowed border-glass-border bg-white/5 text-text-muted opacity-45"
                  : "border-cyan bg-cyan/15 text-cyan hover:bg-cyan/25"
              }`}
            >
              {actions.connectLabel}
            </button>
            {actions.showPair ? (
              <button
                type="button"
                data-testid="vehicle-pair"
                disabled={actions.connectDisabled}
                onClick={() => {
                  void controller.pair();
                }}
                className={`${TARGET} touch-manipulation rounded-md border border-caution/60 bg-white/5 px-3 text-hud-sm font-medium text-caution transition-colors duration-200 ease-out hover:border-caution ${
                  actions.connectDisabled ? "cursor-not-allowed opacity-45" : ""
                }`}
              >
                {TEXT.pair}
              </button>
            ) : null}
            {snapshot.status.state === "auth-needed" ? (
              <button
                type="button"
                data-testid="vehicle-forget"
                onClick={() => {
                  controller.forgetPairing();
                }}
                className={`${TARGET} touch-manipulation rounded-md border border-glass-border bg-white/5 px-3 text-hud-sm font-medium text-text-secondary hover:border-cyan/60`}
              >
                {TEXT.forget}
              </button>
            ) : null}
          </div>
          {actions.showPair ? (
            <p data-testid="vehicle-pair-warning" className="text-hud-sm leading-snug text-caution">
              {TEXT.pairWarning}
            </p>
          ) : null}
          {actions.hint ? (
            <p
              data-testid="vehicle-guard-hint"
              className="text-hud-sm leading-snug text-text-muted"
            >
              {actions.hint}
            </p>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-col gap-1 text-hud-sm leading-snug text-text-muted">
        <p data-testid="vehicle-read-only">{TEXT.readOnly}</p>
        {real ? <p data-testid="vehicle-screen-on">{TEXT.screenOn}</p> : null}
        {real && !simulated ? <p data-testid="vehicle-official-app">{TEXT.officialApp}</p> : null}
        <p data-testid="vehicle-trademark">{TEXT.trademark}</p>
      </div>
    </section>
  );
}
