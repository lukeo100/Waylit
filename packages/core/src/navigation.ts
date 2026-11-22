import type { LatLng } from "./types";

/**
 * Navigation types. Placeholders only: routing, instruction generation and smoothing
 * arrive in later tasks. Nothing here depends on a renderer or a map provider.
 */

/** Manoeuvre shown in the HUD for the next instruction. */
export type Manoeuvre =
  | "depart"
  | "continue"
  | "turn-left"
  | "turn-right"
  | "slight-left"
  | "slight-right"
  | "u-turn"
  | "roundabout"
  | "arrive";

export interface RouteInstruction {
  readonly manoeuvre: Manoeuvre;
  /** Short text such as a street or path name. Plain language, no provider markup. */
  readonly text: string;
  /** Where the manoeuvre happens. */
  readonly at: LatLng;
}

export interface Route {
  /** Ordered polyline of the route geometry. */
  readonly path: readonly LatLng[];
  readonly instructions: readonly RouteInstruction[];
  /** Total length in metres. */
  readonly distanceMetres: number;
}

/** Live progress along a route, as shown in the top left HUD. */
export interface NavigationProgress {
  readonly nextInstruction?: RouteInstruction;
  readonly distanceToNextMetres?: number;
  /** Distance travelled along the route so far, in metres. */
  readonly distanceAlongMetres: number;
  readonly remainingDistanceMetres: number;
  readonly remainingDurationSeconds?: number;
  /** Estimated arrival, milliseconds since the Unix epoch. */
  readonly etaTimestamp?: number;
  /** True once the rider has reached the end of the route. */
  readonly arrived: boolean;
}
