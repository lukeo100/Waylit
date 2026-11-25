"use client";

import { useSyncExternalStore } from "react";
import { devControlsEnabled } from "./dev-controls";

/** True while the browser says it has a network connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const MINUTE_MS = 60_000;

/**
 * The current time to the minute, in milliseconds since the Unix epoch. Undefined until the
 * page has loaded, so the server render and the first client render match.
 */
export function useMinuteClock(): number | undefined {
  const minute = useSyncExternalStore(
    (listener) => {
      const timer = window.setInterval(listener, 5000);
      return () => {
        window.clearInterval(timer);
      };
    },
    () => Math.floor(Date.now() / MINUTE_MS),
    () => 0,
  );
  return minute === 0 ? undefined : minute * MINUTE_MS;
}

const subscribeNever = (): (() => void) => () => undefined;

/** True when the simulation dev controls should be shown. */
export function useDevControls(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => devControlsEnabled(window.location.search, process.env.NODE_ENV),
    () => false,
  );
}

/** The address query string, for reading dev options. Empty on the server. */
export function useSearch(): string {
  return useSyncExternalStore(
    subscribeNever,
    () => window.location.search,
    () => "",
  );
}
