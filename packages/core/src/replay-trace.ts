import { createRng, gaussian } from "./random";
import { fromLocalMetres } from "./geo";
import type { Clock } from "./clock";
import type { GeolocationLike, GeolocationPositionLike } from "./live-gps";
import type { LatLng } from "./types";

/**
 * A generated, recorded-style GPS trace for desks and tests (`?gps=replay`). It is made by code
 * from a seed. It is not a recording of any real ride, and it follows no real road: a figure of
 * eight around an invented centre, ridden at a scooter's pace, with the things a real receiver
 * does (noise, a weak patch, a short dropout, no heading when stopped). It goes through the same
 * `LiveGpsSource` as the phone's GPS.
 */

/** The centre of the generated figure of eight. A point in an open public area, chosen for the demo. */
export const REPLAY_CENTRE: LatLng = { lat: 52.4741, lng: 13.4035 };

export interface ReplayPoint {
  /** Seconds since the trace started. */
  readonly t: number;
  readonly position: GeolocationPositionLike;
}

export interface ReplayTraceOptions {
  readonly seed?: number;
  readonly centre?: LatLng;
  readonly durationSeconds?: number;
  /** Seconds between reports. Default 1. */
  readonly intervalSeconds?: number;
  /** Cruise speed in m/s. Default 5.5 (about 20 km/h). */
  readonly cruiseMps?: number;
}

/** Half width of the figure of eight in metres. */
const LOOP_RADIUS_METRES = 70;

export function generateReplayTrace(options: ReplayTraceOptions = {}): readonly ReplayPoint[] {
  const random = createRng(options.seed ?? 7);
  const centre = options.centre ?? REPLAY_CENTRE;
  const duration = options.durationSeconds ?? 240;
  const interval = options.intervalSeconds ?? 1;
  const cruise = options.cruiseMps ?? 5.5;
  const points: ReplayPoint[] = [];
  // Lemniscate of Gerono: x = r sin(u), y = r sin(u) cos(u). Walk along it at the cruise speed.
  const at = (u: number): { east: number; north: number } => ({
    east: LOOP_RADIUS_METRES * Math.sin(u),
    north: LOOP_RADIUS_METRES * Math.sin(u) * Math.cos(u),
  });
  let u = 0;
  let previous = at(0);
  let previousT = 0;
  for (let t = 0; t <= duration; t += interval) {
    // A stop at the start for the first 4 seconds, then a slow ramp up.
    const ramp = Math.min(Math.max((t - 4) / 6, 0), 1);
    const speed = cruise * ramp;
    const step = speed * (t - previousT);
    // Advance u until the arc length covered matches the step (small steps, simple and stable).
    let covered = 0;
    while (covered < step) {
      const next = at(u + 0.002);
      covered += Math.hypot(next.east - previous.east, next.north - previous.north);
      previous = next;
      u += 0.002;
    }
    previousT = t;
    const truth = at(u);
    const weakPatch = t >= 90 && t < 98;
    // A dropout: no reports at all, so the receiver goes stale.
    if (t >= 150 && t < 161) continue;
    const accuracy = weakPatch ? 62 + random() * 10 : 5 + random() * 6;
    const noise = weakPatch ? 12 : 2;
    const here = fromLocalMetres(centre, {
      east: truth.east + gaussian(random, 0, noise),
      north: truth.north + gaussian(random, 0, noise),
    });
    const ahead = at(u + 0.01);
    const heading =
      ((Math.atan2(ahead.east - truth.east, ahead.north - truth.north) * 180) / Math.PI + 360) %
      360;
    const moving = speed > 1;
    points.push({
      t,
      position: {
        coords: {
          latitude: here.lat,
          longitude: here.lng,
          accuracy,
          // The trace has an altitude near sea level offset, with a poor accuracy, like a phone.
          altitude: 80 + gaussian(random, 0, 1.5),
          altitudeAccuracy: 12 + random() * 6,
          // A phone reports no heading when it is not moving.
          heading: moving ? heading : null,
          speed: moving ? Math.max(0, speed + gaussian(random, 0, 0.2)) : 0,
        },
        timestamp: 0,
      },
    });
  }
  return points;
}

export interface ReplayTimers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface ReplayGeolocationOptions {
  readonly clock: Clock;
  readonly timers: ReplayTimers;
  readonly trace?: readonly ReplayPoint[];
  /** How often the replay checks for reports that are due, in ms. Default 250. */
  readonly pollMs?: number;
}

/**
 * A stand-in for `navigator.geolocation` that plays a trace in real time, then starts it again.
 * It never asks for permission and needs no hardware.
 */
export function createReplayGeolocation(options: ReplayGeolocationOptions): GeolocationLike {
  const trace = options.trace ?? generateReplayTrace();
  const last = trace[trace.length - 1];
  const length = (last?.t ?? 0) + 1;
  const watchers = new Map<
    number,
    { startedMs: number; next: number; lap: number; timer: unknown }
  >();
  let counter = 0;

  return {
    watchPosition(success: (position: GeolocationPositionLike) => void): number {
      const id = ++counter;
      const watcher = {
        startedMs: options.clock.now(),
        next: 0,
        lap: 0,
        timer: undefined as unknown,
      };
      watcher.timer = options.timers.setInterval(() => {
        const elapsed = (options.clock.now() - watcher.startedMs) / 1000;
        for (;;) {
          const point = trace[watcher.next];
          if (!point) {
            // End of the trace: start the next lap from the beginning.
            watcher.next = 0;
            watcher.lap += 1;
            break;
          }
          if (point.t + watcher.lap * length > elapsed) break;
          watcher.next += 1;
          success({ ...point.position, timestamp: options.clock.now() });
        }
      }, options.pollMs ?? 250);
      watchers.set(id, watcher);
      return id;
    },
    clearWatch(id: number): void {
      const watcher = watchers.get(id);
      if (watcher) options.timers.clearInterval(watcher.timer);
      watchers.delete(id);
    },
  };
}
