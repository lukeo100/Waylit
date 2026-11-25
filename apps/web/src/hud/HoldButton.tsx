"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createHoldController, type HoldController } from "./hold";

interface HoldButtonProps {
  /** When true, a touch or mouse press must be held for `holdMs` before it counts. */
  readonly guarded: boolean;
  readonly holdMs: number;
  readonly onActivate: () => void;
  readonly label: string;
  /**
   * How the hold shows. `ring` draws a progress ring around a round button. `fill` grows a
   * tinted fill across a wide button. Either way a held button also takes a static filled
   * state, so the feedback does not rely on animation (see "Reduced motion" in the design
   * system).
   */
  readonly feedback: "ring" | "fill";
  readonly className?: string;
  readonly children: ReactNode;
  /** Tells the parent when a hold starts and stops, so it can show a caption. */
  readonly onHoldChange?: (holding: boolean) => void;
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
 * hold time. A ring track (or an outline for wide buttons) shows that a hold is needed, the
 * ring or fill grows while you hold, and a held button takes a brighter edge and a stronger
 * fill that stay put even with reduced motion. Letting go early does nothing.
 *
 * Keyboard and assistive technology activation (a click with no pointer) goes straight
 * through, because it cannot be a stray touch on a bumpy ride.
 */
export function HoldButton({
  guarded,
  holdMs,
  onActivate,
  label,
  feedback,
  className = "",
  children,
  onHoldChange,
  "data-testid": testId,
}: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const activate = useRef(onActivate);
  const notify = useRef(onHoldChange);
  const controller = useRef<HoldController | undefined>(undefined);

  useEffect(() => {
    activate.current = onActivate;
    notify.current = onHoldChange;
  }, [onActivate, onHoldChange]);

  useEffect(() => {
    const created = createHoldController({
      holdMs,
      timers: browserTimers,
      onComplete: () => {
        activate.current();
      },
      onChange: (next) => {
        setHolding(next);
        notify.current?.(next);
      },
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
      data-feedback={feedback}
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
      className={`relative isolate inline-flex touch-manipulation items-center justify-center select-none [-webkit-touch-callout:none] ${feedback === "fill" ? "overflow-hidden" : ""} ${className}`}
    >
      {feedback === "ring" ? (
        <svg
          viewBox="0 0 44 44"
          aria-hidden="true"
          focusable="false"
          data-testid="hold-ring"
          className="pointer-events-none absolute inset-0 -z-10 size-full -rotate-90"
        >
          {guarded ? (
            <circle
              cx="22"
              cy="22"
              r="20.25"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="2.5"
            />
          ) : null}
          {guarded ? (
            <circle
              cx="22"
              cy="22"
              r="20.25"
              fill="none"
              stroke="var(--wl-color-cyan)"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray="100"
              data-holding={holding}
              className="wl-hold-ring"
              style={{ transitionDuration: `${holdMs}ms` }}
            />
          ) : null}
        </svg>
      ) : (
        <span
          aria-hidden="true"
          data-holding={holding}
          className="wl-hold-fill absolute inset-0 -z-10 bg-danger/30"
          style={{ transitionDuration: `${holdMs}ms` }}
        />
      )}
      {children}
    </button>
  );
}
