import type { NavigationProgress, Route, RouteInstruction } from "./navigation";
import { createRouteIndex, locateInstructions, type RouteIndex } from "./route";

/**
 * Turns a distance along a route into the values the HUD shows: the next instruction, the
 * distance to it, the distance and time left and the arrival time. It knows nothing about a
 * renderer. Getting the distance along the route from a GPS fix is `projectOntoRoute`.
 */

/** A route prepared for progress calculations. Build it once, then reuse it. */
export interface ProgressModel {
  readonly index: RouteIndex;
  readonly instructions: readonly RouteInstruction[];
  /** Distance along the route of each instruction, in metres. */
  readonly instructionDistances: readonly number[];
}

export function createProgressModel(route: Route): ProgressModel {
  const index = createRouteIndex(route.path);
  return {
    index,
    instructions: route.instructions,
    instructionDistances: locateInstructions(index, route.instructions),
  };
}

export interface ProgressInput {
  /** Distance travelled along the route, in metres. */
  readonly distanceAlongMetres: number;
  /** Expected average speed over the rest of the route, in metres per second. */
  readonly paceMps?: number | undefined;
  /** Current time in milliseconds since the Unix epoch, used for the arrival time. */
  readonly nowMs: number;
}

/**
 * An instruction counts as passed once the rider is this far beyond it. The HUD (`computeProgress`)
 * and the turn beacon (`nextTurn`) both use it, so they drop a turn at the same moment.
 */
export const PASSED_TOLERANCE_METRES = 0.5;
/** Within this distance of the end the rider has arrived. */
const ARRIVED_TOLERANCE_METRES = 3;

export function computeProgress(model: ProgressModel, input: ProgressInput): NavigationProgress {
  const total = model.index.totalMetres;
  const along = Math.min(Math.max(input.distanceAlongMetres, 0), total);
  const remaining = Math.max(total - along, 0);
  const arrived = remaining <= ARRIVED_TOLERANCE_METRES;

  const nextIndex = model.instructionDistances.findIndex(
    (distance) => distance >= along - PASSED_TOLERANCE_METRES,
  );
  const nextInstruction = nextIndex >= 0 ? model.instructions[nextIndex] : undefined;
  const nextDistance = nextIndex >= 0 ? model.instructionDistances[nextIndex] : undefined;

  const pace = input.paceMps;
  const hasPace = pace !== undefined && Number.isFinite(pace) && pace > 0;
  const remainingSeconds = arrived ? 0 : hasPace ? remaining / pace : undefined;

  return {
    ...(nextInstruction !== undefined && nextDistance !== undefined
      ? { nextInstruction, distanceToNextMetres: Math.max(nextDistance - along, 0) }
      : {}),
    distanceAlongMetres: along,
    remainingDistanceMetres: remaining,
    ...(remainingSeconds !== undefined
      ? {
          remainingDurationSeconds: remainingSeconds,
          etaTimestamp: input.nowMs + remainingSeconds * 1000,
        }
      : {}),
    arrived,
  };
}
