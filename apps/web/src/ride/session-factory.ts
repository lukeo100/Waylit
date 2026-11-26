import {
  LiveGpsSource,
  createReplayGeolocation,
  systemClock,
  type Clock,
  type GeolocationLike,
  type ReplayTimers,
} from "@waylit/core";
import type { GpsChoice } from "@/map/map-settings";
import { RideSession } from "./ride-session";

export interface SessionEnvironment {
  /** `navigator.geolocation`, or undefined when there is none (server, or an old browser). */
  readonly geolocation: GeolocationLike | undefined;
  readonly timers: ReplayTimers;
  readonly clock?: Clock;
}

/**
 * Makes the ride session for a position source. `sim` is the simulated ride on the demo route.
 * `live` is the phone's GPS as a free ride, and nothing is asked of the browser until the rider
 * taps Start trip. `replay` is a generated trace through the same live source, for desks.
 */
export function createSessionFor(gps: GpsChoice, environment: SessionEnvironment): RideSession {
  const clock = environment.clock ?? systemClock;
  if (gps === "sim") return new RideSession({ clock });
  const geolocation =
    gps === "replay"
      ? createReplayGeolocation({ clock, timers: environment.timers })
      : environment.geolocation;
  return new RideSession({ clock, live: new LiveGpsSource({ geolocation, clock }) });
}

export function browserEnvironment(): SessionEnvironment {
  return {
    geolocation: typeof navigator === "undefined" ? undefined : navigator.geolocation,
    timers: {
      setInterval: (callback, ms) => window.setInterval(callback, ms),
      clearInterval: (handle) => {
        window.clearInterval(handle as number);
      },
    },
  };
}
