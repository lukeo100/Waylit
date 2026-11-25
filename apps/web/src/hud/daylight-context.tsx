"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_SUN_POSITION, unknownDaylight, type DaylightState } from "./daylight";

const DaylightContext = createContext<DaylightState>(unknownDaylight(DEFAULT_SUN_POSITION));

/**
 * Makes the daylight state available to everything under the riding screen, so the HUD and the
 * 3D scene's lighting (task 8) read the same value.
 */
export function DaylightProvider({
  value,
  children,
}: {
  readonly value: DaylightState;
  readonly children: ReactNode;
}) {
  return <DaylightContext.Provider value={value}>{children}</DaylightContext.Provider>;
}

/**
 * The current daylight: the sun's elevation, azimuth and phase at the rider's position and the
 * current (or developer overridden) time, plus a smooth `factor` from 0 (dark) to 1 (day).
 * Outside a provider it reports night.
 */
export function useDaylight(): DaylightState {
  return useContext(DaylightContext);
}
