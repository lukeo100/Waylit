"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createHoldController, type HoldController } from "./hold";

interface HoldButtonProps {
  /** When true, a touch or mouse press must be held for `holdMs` before it counts. */
  readonly guarded: boolean;
  readonly holdMs: number;
  readonly onActivate: () => void;
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
  /** Text shown under the content while guarded and while held. Used by wide buttons. */
  readonly hint?: { readonly idle: string; readonly holding: string };
  readonly "data-testid"?: string;
}

const browserTimers = {
  setTimeout: (callback: () => void, ms: number) => window.setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => {
    window.clearTimeout(handle as number);
  },
};

/**
 * A button that asks for a deliberate press while the speed guard is on. When the guard is
 * off it is an ordinary button. When it is on, a touch or mouse press has to be held for the
 * hold time, and the button fills while you hold. Letting go early does nothing.
 *
 * Keyboard and assistive technology activation (a click with no pointer) goes straight
 * through, because it cannot be a stray touch on a bumpy ride.
 */
export function HoldButton({
  guarded,
  holdMs,
  onActivate,
  label,
  className = "",
  children,
  hint,
  "data-testid": testId,
}: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const activate = useRef(onActivate);
  const controller = useRef<HoldController | undefined>(undefined);

  useEffect(() => {
    activate.current = onActivate;
  }, [onActivate]);

  useEffect(() => {
    const created = createHoldController({
      holdMs,
      timers: browserTimers,
      onComplete: () => {
        activate.current();
      },
      onChange: setHolding,
    });
    controller.current = created;
    return () => {
      created.cancel();
      controller.current = undefined;
    };
  }, [holdMs]);

  useEffect(() => {
    // If the guard turns off mid hold, stop the hold.
    if (!guarded) controller.current?.cancel();
  }, [guarded]);

  const stop = (): void => {
    controller.current?.cancel();
  };

  return (
    <button
      type="button"
      aria-label={guarded ? `${label}. Hold to press.` : label}
      data-testid={testId}
      data-guarded={guarded}
      data-holding={holding}
      onPointerDown={(event) => {
        if (guarded && event.isPrimary) controller.current?.begin();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(event) => {
        if (guarded) event.preventDefault();
      }}
      onClick={(event) => {
        // A pointer click while guarded is either the end of a finished hold or a quick tap.
        // Both are ignored. The hold itself calls `onActivate`.
        if (guarded && event.detail > 0) return;
        onActivate();
      }}
      className={`relative isolate inline-flex touch-manipulation items-center justify-center overflow-hidden select-none [-webkit-touch-callout:none] ${className}`}
    >
      <span
        aria-hidden="true"
        data-holding={holding}
        className="wl-hold-fill absolute inset-0 -z-10 bg-cyan/40"
        style={{ transitionDuration: `${holdMs}ms` }}
      />
      {children}
      {hint && guarded ? (
        <span className="text-xs font-medium opacity-90">{holding ? hint.holding : hint.idle}</span>
      ) : null}
    </button>
  );
}
