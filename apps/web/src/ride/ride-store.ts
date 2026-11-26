import type { Scheduler } from "@waylit/core";
import type { VehicleAdapter } from "@waylit/vehicle";
import { createEmptySnapshot, type RideSession, type RideSnapshot } from "./ride-session";

/**
 * Connects a `RideSession` to React through `useSyncExternalStore`. It runs the session on a
 * timer only while something is subscribed, and tells subscribers after every tick or action.
 * It has no DOM of its own: the caller passes the timer functions in.
 */

/** How often the HUD refreshes, in milliseconds. The GPS simulator itself fixes once a second. */
export const HUD_REFRESH_MS = 250;

export interface RideStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): RideSnapshot;
  /** Snapshot for server rendering. It never changes. */
  getServerSnapshot(): RideSnapshot;
  start(): void;
  endTrip(): void;
  reset(): void;
  setPlaybackSpeed(multiplier: number): void;
  setTelemetryLost(lost: boolean): void;
  /** Switches between the mock vehicle (undefined) and an adapter owned by the app. */
  setVehicle(adapter: VehicleAdapter | undefined): void;
}

export function createRideStore(session: RideSession, scheduler: Scheduler): RideStore {
  const listeners = new Set<() => void>();
  const serverSnapshot = createEmptySnapshot();
  let timer: unknown;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const act = (action: () => void): void => {
    action();
    notify();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        // Catch up straight away, so a screen that was away does not show an old frame.
        session.tick();
        timer = scheduler.setInterval(() => {
          session.tick();
          notify();
        }, HUD_REFRESH_MS);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== undefined) {
          scheduler.clearInterval(timer);
          timer = undefined;
        }
      };
    },
    getSnapshot: () => session.getSnapshot(),
    getServerSnapshot: () => serverSnapshot,
    start: () => act(() => session.start()),
    endTrip: () => act(() => session.endTrip()),
    reset: () => act(() => session.reset()),
    setPlaybackSpeed: (multiplier) => act(() => session.setPlaybackSpeed(multiplier)),
    setTelemetryLost: (lost) => act(() => session.setTelemetryLost(lost)),
    setVehicle: (adapter) => act(() => session.setVehicle(adapter)),
  };
}
