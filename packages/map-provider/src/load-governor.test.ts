import { describe, expect, it } from "vitest";
import { LoadGovernor, type LoadChange } from "./load-governor";

/** Feeds frames at `fps` until a change happens or `seconds` pass. Returns the time and change. */
function run(
  governor: LoadGovernor,
  startMs: number,
  fps: number,
  seconds: number,
): { t: number; change: LoadChange | undefined } {
  let t = startMs;
  for (let i = 0; i < fps * seconds; i++) {
    t += 1000 / fps;
    governor.recordFrame(t);
    const change = governor.evaluate(t);
    if (change) return { t, change };
  }
  return { t, change: undefined };
}

describe("LoadGovernor", () => {
  it("changes nothing at a steady 30 fps", () => {
    const governor = new LoadGovernor("high", false);
    expect(run(governor, 0, 30, 60).change).toBeUndefined();
    expect(governor.fxLevel).toBe("high");
    expect(governor.holoDetail).toBe("full");
  });

  it("with the effect off (the Google default) it steps only the hologram, to light then minimal", () => {
    const governor = new LoadGovernor("off", false);
    const first = run(governor, 0, 20, 30);
    expect(first.change).toEqual({ holo: "light" });
    const second = run(governor, first.t, 20, 30);
    expect(second.change).toEqual({ holo: "minimal" });
    expect(run(governor, second.t, 10, 30).change).toBeUndefined();
    expect(governor.fxLevel).toBe("off");
    expect(governor.holoDetail).toBe("minimal");
  });

  it("with the effect on, the effect steps down first and the hologram only after it is off", () => {
    const governor = new LoadGovernor("high", false);
    const changes: LoadChange[] = [];
    let t = 0;
    for (let i = 0; i < 8; i++) {
      const result = run(governor, t, 20, 30);
      t = result.t;
      if (result.change) changes.push(result.change);
    }
    expect(changes).toEqual([{ fx: "low" }, { fx: "off" }, { holo: "light" }, { holo: "minimal" }]);
  });

  it("makes one change at a time and waits to judge the next one", () => {
    const governor = new LoadGovernor("high", false);
    const first = run(governor, 0, 20, 30);
    expect(first.change).toEqual({ fx: "low" });
    // Right after a change there is not enough evidence for another.
    let t = first.t;
    for (let i = 0; i < 40; i++) {
      t += 50;
      governor.recordFrame(t);
      expect(governor.evaluate(t)).toBeUndefined();
    }
  });

  it("when the address pins the effect level, the hologram still steps down", () => {
    const governor = new LoadGovernor("high", true);
    const first = run(governor, 0, 20, 30);
    expect(first.change).toEqual({ holo: "light" });
    expect(governor.fxLevel).toBe("high");
  });

  it("never steps back up when the frame rate recovers", () => {
    const governor = new LoadGovernor("off", false);
    const { t } = run(governor, 0, 20, 30);
    expect(governor.holoDetail).toBe("light");
    expect(run(governor, t, 60, 60).change).toBeUndefined();
    expect(governor.holoDetail).toBe("light");
  });

  it("a reset (a new ride) restarts the judging, and keeps the levels", () => {
    const governor = new LoadGovernor("off", false);
    let t = 0;
    for (let i = 0; i < 300; i++) {
      t += 50;
      governor.recordFrame(t);
    }
    governor.reset();
    expect(governor.evaluate(t + 50)).toBeUndefined();
    expect(governor.holoDetail).toBe("full");
  });
});
