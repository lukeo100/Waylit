"use client";

import { useEffect, useId, useState } from "react";
import type { FxLevel, MapChoice } from "@waylit/map-provider";
import { HOLD_TO_PRESS_MS } from "@/ride/guard";
import {
  MAP_SETTINGS_TEXT as TEXT,
  sheetShouldClose,
  type MapSettings as MapSettingsValue,
  type MapSettingsModel,
} from "@/map/map-settings";
import { HoldButton } from "./HoldButton";
import { CloseIcon, LayersIcon } from "./icons";

/** The least a touch target is allowed to be, 44 pixels (2.75rem). */
const TARGET = "min-h-11 min-w-11";

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  readonly label: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly disabled: boolean;
  readonly onChange: (value: T) => void;
  readonly describedBy?: string | undefined;
  readonly testId: string;
}

/** A row of exclusive choices. One is cyan, the rest are quiet. Each is at least 44 pixels tall. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
  describedBy,
  testId,
}: SegmentedProps<T>) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <p id={labelId} className="text-hud-sm leading-none font-medium text-text-secondary">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        data-testid={testId}
        className="grid auto-cols-fr grid-flow-col gap-1"
      >
        {options.map((option) => {
          const checked = option.value === value;
          const off = disabled || option.disabled === true;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={off}
              data-value={option.value}
              onClick={() => {
                if (!checked) onChange(option.value);
              }}
              className={`${TARGET} touch-manipulation rounded-md border px-2 text-hud-sm leading-tight font-medium transition-colors duration-200 ease-out ${
                checked
                  ? "border-cyan bg-cyan/15 text-cyan"
                  : "border-glass-border bg-white/5 text-text-secondary hover:border-cyan/60"
              } ${off && !checked ? "cursor-not-allowed opacity-45" : ""}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FX_OPTIONS: readonly Option<FxLevel>[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
];

interface SheetProps {
  readonly model: MapSettingsModel;
  readonly onChange: (patch: MapSettingsValue) => void;
  readonly onClose: () => void;
  readonly id?: string;
}

/**
 * The settings sheet: the map (Google 3D tiles or the fallback map) and the hologram screen
 * effect (off, low, high). Glass like the dock, one cyan accent, nothing red. It is a fixed panel
 * on the right that stops above the credits strip (it reads `--wl-credits-clearance`), so it can
 * never cover the credits.
 */
export function MapSettingsSheet({ model, onChange, onClose, id }: SheetProps) {
  const titleId = useId();
  const mapNote = useId();
  const fxNote = useId();
  const mapOptions: readonly Option<MapChoice>[] = [
    { value: "cesium", label: TEXT.googleOption, disabled: !model.googleAvailable },
    { value: "fallback", label: TEXT.fallbackOption },
  ];
  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="map-settings-sheet"
      className="wl-glass pointer-events-auto fixed top-[max(0.75rem,var(--wl-safe-top),2.4dvh)] right-[max(0.75rem,var(--wl-safe-right),2vw)] bottom-[calc(var(--wl-credits-clearance,2rem)+0.5rem)] z-30 flex w-[min(21rem,36vw)] flex-col gap-3 overflow-y-auto p-3 wl-hud-text"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-hud-md leading-none font-semibold text-text">
          {TEXT.title}
        </h2>
        <button
          type="button"
          aria-label="Close map settings"
          data-testid="map-settings-close"
          onClick={onClose}
          className={`${TARGET} inline-flex touch-manipulation items-center justify-center rounded-full border border-glass-border text-text-secondary hover:border-cyan`}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <Segmented
        label={TEXT.mapLabel}
        options={mapOptions}
        value={model.map}
        disabled={model.mapLockedByAddress}
        describedBy={mapNote}
        testId="map-choice"
        onChange={(value) => {
          onChange({ map: value });
        }}
      />
      <div id={mapNote} className="flex flex-col gap-1 text-hud-sm leading-snug text-text-muted">
        {model.mapLockedByAddress ? <p data-testid="map-locked">{TEXT.mapLocked}</p> : null}
        {model.googleAvailable ? (
          <p data-testid="map-quota">{TEXT.quota}</p>
        ) : (
          <p data-testid="map-no-token">{TEXT.noToken}</p>
        )}
      </div>

      <Segmented
        label={TEXT.fxLabel}
        options={FX_OPTIONS}
        value={model.fx}
        disabled={model.fxLockedByAddress}
        describedBy={fxNote}
        testId="fx-choice"
        onChange={(value) => {
          onChange({ fx: value });
        }}
      />
      <div id={fxNote} className="flex flex-col gap-1 text-hud-sm leading-snug text-text-muted">
        <p>{TEXT.fxHint}</p>
        {model.fxLockedByAddress ? <p data-testid="fx-locked">{TEXT.fxLocked}</p> : null}
      </div>
    </div>
  );
}

interface MapSettingsProps {
  readonly model: MapSettingsModel;
  /** True while the speed guard is on (above 8 km/h): the button needs a hold. */
  readonly guarded: boolean;
  readonly onChange: (patch: MapSettingsValue) => void;
}

/**
 * The map settings control for the riding screen: one round 44 pixel button under the minimap
 * that opens the sheet. Above the guard speed the button needs a hold like every other control,
 * and the sheet closes by itself when the guard turns on. The button never sits over the credits
 * strip or the top text.
 */
export function MapSettings({ model, guarded, onChange }: MapSettingsProps) {
  const [open, setOpen] = useState(false);
  const sheetId = useId();

  // Closing during render (React allows it for the component's own state) means the sheet is
  // never drawn for a frame after the guard turns on.
  if (sheetShouldClose(open, guarded)) setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <HoldButton
        label="Map settings"
        guarded={guarded}
        holdMs={HOLD_TO_PRESS_MS}
        feedback="ring"
        aria-expanded={open}
        aria-haspopup="dialog"
        onActivate={() => {
          setOpen((current) => !current);
        }}
        className={`size-11 shrink-0 rounded-full border bg-white/5 transition-colors duration-200 ease-out hover:border-cyan data-[holding=true]:border-cyan data-[holding=true]:bg-cyan/25 ${
          open ? "border-cyan text-cyan" : "border-glass-border text-text-secondary"
        }`}
        data-testid="map-settings-button"
      >
        <LayersIcon size="48%" />
      </HoldButton>
      {open ? (
        <MapSettingsSheet
          id={sheetId}
          model={model}
          onChange={onChange}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
