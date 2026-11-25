import { describe, expect, it } from "vitest";
import { DEMO_ROUTE } from "./demo-route";
import { formatDistance } from "./format";
import { GpsSimulator } from "./gps-simulator";
import { createManualClock } from "./clock";
import { createProgressModel, computeProgress } from "./progress";
import { projectOntoRoute } from "./route";
import {
  DEFAULT_TURN_THRESHOLDS,
  directionOf,
  isSlight,
  nextTurn,
  turnPhase,
} from "./turn-guidance";

const model = createProgressModel(DEMO_ROUTE);

describe("directionOf", () => {
  it("maps manoeuvres to what the rider has to do", () => {
    expect(directionOf("turn-left")).toBe("left");
    expect(directionOf("slight-left")).toBe("left");
    expect(directionOf("turn-right")).toBe("right");
    expect(directionOf("slight-right")).toBe("right");
    expect(directionOf("u-turn")).toBe("u-turn");
    expect(directionOf("roundabout")).toBe("roundabout");
    expect(directionOf("arrive")).toBe("arrive");
  });

  it("asks nothing for depart and continue", () => {
    expect(directionOf("depart")).toBeUndefined();
    expect(directionOf("continue")).toBeUndefined();
  });

  it("knows a slight turn from a full one", () => {
    expect(isSlight("slight-right")).toBe(true);
    expect(isSlight("turn-right")).toBe(false);
  });
});

describe("turnPhase", () => {
  it("steps from far to now as the distance closes", () => {
    const t = DEFAULT_TURN_THRESHOLDS;
    expect(turnPhase(t.approachingMetres + 1)).toBe("far");
    expect(turnPhase(t.approachingMetres)).toBe("approaching");
    expect(turnPhase(t.imminentMetres + 1)).toBe("approaching");
    expect(turnPhase(t.imminentMetres)).toBe("imminent");
    expect(turnPhase(t.nowMetres + 1)).toBe("imminent");
    expect(turnPhase(t.nowMetres)).toBe("now");
    expect(turnPhase(0)).toBe("now");
  });
});

describe("nextTurn on the demo route", () => {
  it("skips the departure and finds the first real manoeuvre", () => {
    const turn = nextTurn(model, 0);
    expect(turn?.instruction.manoeuvre).toBe("slight-left");
    expect(turn?.direction).toBe("left");
    expect(turn?.slight).toBe(true);
    expect(turn?.phase).toBe("far");
  });

  it("finds the first full left turn and counts the distance down", () => {
    const leftIndex = DEMO_ROUTE.instructions.findIndex((i) => i.manoeuvre === "turn-left");
    const at = model.instructionDistances[leftIndex]!;
    const labels: string[] = [];
    let last = Infinity;
    for (const back of [300, 200, 120, 60, 30, 10, 0]) {
      const turn = nextTurn(model, at - back);
      expect(turn?.instruction.manoeuvre).toBe("turn-left");
      expect(turn?.direction).toBe("left");
      expect(turn?.slight).toBe(false);
      expect(turn!.distanceMetres).toBeCloseTo(back, 3);
      expect(turn!.distanceMetres).toBeLessThan(last);
      last = turn!.distanceMetres;
      labels.push(turn!.label);
    }
    expect(labels).toEqual(["300 m", "200 m", "120 m", "60 m", "30 m", "10 m", "0 m"]);
  });

  it("uses the same rounding as the HUD", () => {
    const turn = nextTurn(model, 100)!;
    const hud = formatDistance(turn.distanceMetres);
    expect(turn.value).toBe(hud.value);
    expect(turn.unit).toBe(hud.unit);
    expect(turn.label).toBe(`${hud.value} ${hud.unit}`);
  });

  it("agrees with the progress model on distance and instruction", () => {
    for (const along of [20, 700, 1500, 2600, 3300]) {
      const progress = computeProgress(model, { distanceAlongMetres: along, nowMs: 0 });
      const turn = nextTurn(model, along)!;
      // The progress model also reports the departure, so only compare when it is a turn.
      if (progress.nextInstruction && turn.instruction === progress.nextInstruction) {
        expect(turn.distanceMetres).toBeCloseTo(progress.distanceToNextMetres!, 6);
      }
    }
  });

  it("drops a turn once the rider is past it", () => {
    const first = nextTurn(model, 0)!;
    const after = nextTurn(model, first.atMetres + 2)!;
    expect(after.atMetres).toBeGreaterThan(first.atMetres);
  });

  it("ends with the arrival and then nothing", () => {
    const end = model.index.totalMetres;
    const last = nextTurn(model, end - 30)!;
    expect(last.direction).toBe("arrive");
    expect(last.phase).toBe("imminent");
    // Past the end the rider is clamped to the arrival: the same turn, zero metres away.
    const past = nextTurn(model, end + 5);
    const zero = formatDistance(0);
    expect(past).toMatchObject({
      direction: "arrive",
      distanceMetres: 0,
      phase: "now",
      atMetres: end,
      label: `${zero.value} ${zero.unit}`,
    });
    expect(nextTurn(model, end)).toEqual(past);
  });

  it("clamps a negative or huge distance along", () => {
    expect(nextTurn(model, -50)?.atMetres).toBe(nextTurn(model, 0)?.atMetres);
    expect(nextTurn(model, 1e9)?.direction).toBe("arrive");
  });
});

describe("driven by the GPS simulator (success criterion 4)", () => {
  it("shows a left turn that counts down as the simulated rider approaches", () => {
    const clock = createManualClock(0);
    const simulator = new GpsSimulator({ path: DEMO_ROUTE.path, clock, seed: 7 });
    simulator.start();
    const seen: { distance: number; direction: string; label: string }[] = [];
    let hint = 0;
    let target: number | undefined;
    for (let second = 0; second < 900; second++) {
      clock.advance(1000);
      const fix = simulator.update();
      if (!fix) continue;
      const projection = projectOntoRoute(model.index, fix.position, { hintMetres: hint });
      hint = projection.distanceMetres;
      const turn = nextTurn(model, hint)!;
      if (turn.instruction.manoeuvre !== "turn-left") continue;
      target ??= turn.atMetres;
      if (turn.atMetres !== target) break;
      if (turn.phase !== "far") {
        seen.push({
          distance: turn.distanceMetres,
          direction: turn.direction,
          label: turn.label,
        });
      }
    }
    expect(target).toBeDefined();
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.every((s) => s.direction === "left")).toBe(true);
    // The countdown only ever goes down, within a metre of GPS noise.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.distance).toBeLessThanOrEqual(seen[i - 1]!.distance + 1);
    }
    // The text on the beacon and the HUD never goes up either. Compare its value in metres.
    const labelMetres = seen.map((s) => {
      const [value = "0", unit = "m"] = s.label.split(" ");
      return Number(value) * (unit === "km" ? 1000 : 1);
    });
    for (let i = 1; i < labelMetres.length; i++) {
      expect(labelMetres[i]!, `label ${String(i)}: ${seen[i]!.label}`).toBeLessThanOrEqual(
        labelMetres[i - 1]!,
      );
    }
    expect(seen[0]!.distance).toBeGreaterThan(150);
    expect(seen[seen.length - 1]!.distance).toBeLessThan(25);
  });
});
