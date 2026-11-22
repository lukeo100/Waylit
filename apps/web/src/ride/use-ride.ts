"use client";

import { useState, useSyncExternalStore } from "react";
import { RideSession, type RideSnapshot } from "./ride-session";
import { createRideStore, type RideStore } from "./ride-store";

/**
 * Runs one simulated ride for the riding screen. Returns the latest snapshot and the actions.
 * The first render and server render use a fixed empty snapshot, so there is no hydration
 * mismatch, and the live one takes over straight after.
 */
export function useRide(): { readonly snapshot: RideSnapshot; readonly actions: RideStore } {
  const [store] = useState(() =>
    createRideStore(new RideSession(), {
      setInterval: (callback, ms) => window.setInterval(callback, ms),
      clearInterval: (handle) => {
        window.clearInterval(handle as number);
      },
    }),
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { snapshot, actions: store };
}
