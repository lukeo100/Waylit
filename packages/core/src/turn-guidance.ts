import { formatDistance } from "./format";
import type { Manoeuvre, RouteInstruction } from "./navigation";
import { PASSED_TOLERANCE_METRES, type ProgressModel } from "./progress";

/**
 * Turn guidance: which turn is coming up, how far away it is and how urgent it is. It is the
 * logic behind the turn beacon and the distance countdown in the 3D scene, and it agrees with
 * the HUD because both read the same route progress and the same distance rounding. It knows
 * nothing about a renderer or a map provider.
 *
 * "Next turn" means the next instruction that asks the rider to do something. The departure
 * and plain "continue" instructions are skipped, so a beacon never stands at the start. The HUD shows
 * the departure instruction at the very start (until the rider is 0.5 m past it) and the beacon
 * never does. Everywhere else both show the same next instruction at the same rounded distance,
 * as long as both are given the same distance along the route (the ride session's).
 */

export type TurnDirection = "left" | "right" | "u-turn" | "roundabout" | "arrive";

/**
 * How close the turn is.
 *
 *   far          a long way off, no beacon yet
 *   approaching  the beacon shows with a distance countdown
 *   imminent     the next few seconds at riding speed, the beacon is brightest
 *   now          the turn is here
 */
export type TurnPhase = "far" | "approaching" | "imminent" | "now";

/** Distances at which the phase changes, in metres. */
export interface TurnPhaseThresholds {
  readonly approachingMetres: number;
  readonly imminentMetres: number;
  readonly nowMetres: number;
}

export const DEFAULT_TURN_THRESHOLDS: TurnPhaseThresholds = {
  approachingMetres: 250,
  imminentMetres: 60,
  nowMetres: 12,
};

export interface TurnGuidance {
  readonly instruction: RouteInstruction;
  readonly direction: TurnDirection;
  /** True for "bear left" and "bear right", false for a full turn. */
  readonly slight: boolean;
  /** Metres from the rider to the turn, never negative. */
  readonly distanceMetres: number;
  /** Distance along the route of the turn, in metres. */
  readonly atMetres: number;
  /** The countdown text, for example "120 m" or "1.2 km". Same rounding as the HUD. */
  readonly label: string;
  readonly phase: TurnPhase;
  /** The distance as a number with its unit, for the beacon text. */
  readonly value: string;
  readonly unit: string;
}

/** What a manoeuvre asks of the rider, or undefined when it asks for nothing (depart, continue). */
export function directionOf(manoeuvre: Manoeuvre): TurnDirection | undefined {
  switch (manoeuvre) {
    case "turn-left":
    case "slight-left":
      return "left";
    case "turn-right":
    case "slight-right":
      return "right";
    case "u-turn":
      return "u-turn";
    case "roundabout":
      return "roundabout";
    case "arrive":
      return "arrive";
    case "depart":
    case "continue":
      return undefined;
  }
}

export function isSlight(manoeuvre: Manoeuvre): boolean {
  return manoeuvre === "slight-left" || manoeuvre === "slight-right";
}

/** The phase for a distance to the turn. Thresholds are inclusive of the nearer phase. */
export function turnPhase(
  distanceMetres: number,
  thresholds: TurnPhaseThresholds = DEFAULT_TURN_THRESHOLDS,
): TurnPhase {
  if (distanceMetres <= thresholds.nowMetres) return "now";
  if (distanceMetres <= thresholds.imminentMetres) return "imminent";
  if (distanceMetres <= thresholds.approachingMetres) return "approaching";
  return "far";
}

/**
 * The next turn for a rider at `alongMetres`, or undefined when none is left. A turn that the
 * rider has just passed does not count. Instruction order is the order along the route, as in
 * `computeProgress`.
 */
export function nextTurn(
  model: ProgressModel,
  alongMetres: number,
  thresholds: TurnPhaseThresholds = DEFAULT_TURN_THRESHOLDS,
): TurnGuidance | undefined {
  const along = Math.min(Math.max(alongMetres, 0), model.index.totalMetres);
  for (let i = 0; i < model.instructions.length; i++) {
    const at = model.instructionDistances[i];
    const instruction = model.instructions[i];
    if (at === undefined || instruction === undefined) continue;
    if (at < along - PASSED_TOLERANCE_METRES) continue;
    const direction = directionOf(instruction.manoeuvre);
    if (direction === undefined) continue;
    const distance = Math.max(at - along, 0);
    const formatted = formatDistance(distance);
    return {
      instruction,
      direction,
      slight: isSlight(instruction.manoeuvre),
      distanceMetres: distance,
      atMetres: at,
      label: `${formatted.value} ${formatted.unit}`,
      phase: turnPhase(distance, thresholds),
      value: formatted.value,
      unit: formatted.unit,
    };
  }
  return undefined;
}
