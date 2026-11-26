"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { GpsChoice } from "@/map/map-settings";
import type { RideSnapshot } from "./ride-session";
import { createRideStore, type RideStore } from "./ride-store";
import { browserEnvironment, createSessionFor } from "./session-factory";

/**
 * Runs one ride for the riding screen: the simulator on the demo route, or live phone GPS as a
 * free ride. Returns the latest snapshot and the actions. The first render and server render use
 * a fixed empty snapshot, so there is no hydration mismatch, and the live one takes over straight
 * after. The source can only change while no trip is running (the settings sheet enforces that),
 * and a change starts a fresh session.
 */
export function useRide(gps: GpsChoice): {
  readonly snapshot: RideSnapshot;
  readonly actions: RideStore;
} {
  const store = useMemo(() => {
    const environment = browserEnvironment();
    return createRideStore(createSessionFor(gps, environment), environment.timers);
  }, [gps]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { snapshot, actions: store };
}
