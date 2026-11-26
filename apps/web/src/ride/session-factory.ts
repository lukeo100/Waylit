import {
  LiveGpsSource,
  createReplayGeolocation,
  systemClock,
  type Clock,
  type GeolocationLike,
  type ReplayTimers,
} from "@waylit/core";
import type { GpsChoice } from "@/map/map-settings";
import type { VehicleAdapter } from "@waylit/vehicle";
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
 * `vehicle` is an adapter owned by the app, such as the Bluetooth one. Without it the mock runs.
 */
export function createSessionFor(
  gps: GpsChoice,
  environment: SessionEnvironment,
  vehicle?: VehicleAdapter,
): RideSession {
  const clock = environment.clock ?? systemClock;
  if (gps === "sim") return new RideSession({ clock, vehicle });
  const geolocation =
    gps === "replay"
      ? createReplayGeolocation({ clock, timers: environment.timers })
      : environment.geolocation;
  return new RideSession({ clock, vehicle, live: new LiveGpsSource({ geolocation, clock }) });
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
