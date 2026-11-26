"use client";

import { useState, type ReactNode, type Ref } from "react";
import { CENTRE_CLEARANCE_VAR, DOCK_CLEARANCE_VAR, useClearanceVar } from "./use-clearance";

interface HudFrameProps {
  /** Top left: the speed and turn card. */
  readonly navigation?: ReactNode;
  /** Top right, first row: the status chip. */
  readonly status?: ReactNode;
  /** Top right, second row: the map settings button and the minimap. */
  readonly mapControls?: ReactNode;
  /** Top right, under the minimap: where the dev overlay and the quiet map note are drawn. */
  readonly statsSlotRef?: Ref<HTMLDivElement>;
  /** Low in the clear middle: the start prompt and the dev controls. */
  readonly centre?: ReactNode;
  /** The joined dock, centred above the credits strip. */
  readonly dock?: ReactNode;
  /** The reserved credits strip. Always last, always its own row. */
  readonly credits: ReactNode;
}

/**
 * The layout of the riding screen, without any data, so the ride page and the dev preview draw
 * exactly the same HUD. It is a grid of three rows over the full screen scene: the top area
 * (which grows), the dock and the credits strip. Nothing in it paints a backdrop: every group
 * brings its own small plate or glass panel, so the scene stays clear in the middle and at the
 * edges.
 *
 *   top left      speed and turn card
 *   top right     status chip, then the map settings button beside the round minimap
 *   centre        clear, apart from the start prompt before a trip
 *   bottom        the joined dock, content sized and centred
 *   bottom edge   the credits strip, which nothing overlaps
 */
export function HudFrame({
  navigation,
  status,
  mapControls,
  statsSlotRef,
  centre,
  dock,
  credits,
}: HudFrameProps) {
  // The dock and the centre group publish where their top edge is, so the settings sheet can stop
  // above them (see MapSettings).
  const [dockElement, setDockElement] = useState<HTMLElement | null>(null);
  const [centreElement, setCentreElement] = useState<HTMLElement | null>(null);
  useClearanceVar(dockElement, DOCK_CLEARANCE_VAR);
  useClearanceVar(centreElement, CENTRE_CLEARANCE_VAR);
  const top = navigation !== undefined || status !== undefined || mapControls !== undefined;
  return (
    <div
      data-testid="hud-frame"
      className="relative z-10 grid h-full grid-rows-[minmax(0,1fr)_auto_auto]"
    >
      <div className="relative row-start-1 min-h-0 pt-[max(0.6rem,var(--wl-safe-top),2.2dvh)] pr-[max(0.6rem,var(--wl-safe-right),1.6vw)] pl-[max(0.6rem,var(--wl-safe-left),1.6vw)]">
        {top ? (
          <div className="pointer-events-none flex h-full items-start justify-between gap-[1.5vw] *:pointer-events-auto">
            <div className="min-w-0">{navigation}</div>
            {/* The column stops above the centre row (start prompt, dev controls), and the slot
                under the minimap clips rather than run into it on the shortest screens. */}
            <div className="flex max-h-[calc(100%-4.5rem)] min-h-0 shrink-0 flex-col items-end gap-[clamp(0.35rem,1.8dvh,0.7rem)]">
              {status}
              {mapControls ? (
                <div className="flex items-center gap-[clamp(0.35rem,0.9vw,0.6rem)]">
                  {mapControls}
                </div>
              ) : null}
              <div
                ref={statsSlotRef}
                className="flex min-h-0 shrink flex-col items-end gap-1 overflow-hidden"
              />
            </div>
          </div>
        ) : null}
        {centre ? (
          <div
            ref={setCentreElement}
            className="pointer-events-none absolute inset-x-0 bottom-[1.5dvh] flex flex-col items-center gap-[1.2dvh]"
          >
            {centre}
          </div>
        ) : null}
      </div>

      {dock ? (
        <div
          ref={setDockElement}
          className="row-start-2 flex justify-center pt-[1dvh] pr-[max(var(--wl-safe-right),clamp(0.5rem,2vw,2.5rem))] pb-[clamp(0.25rem,1.4dvh,0.6rem)] pl-[max(var(--wl-safe-left),clamp(0.5rem,2vw,2.5rem))]"
        >
          {dock}
        </div>
      ) : null}

      {credits}
    </div>
  );
}
