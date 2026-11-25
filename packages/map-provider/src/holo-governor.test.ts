import { describe, expect, it } from "vitest";
import { RouteGuide } from "./guidance";
import {
  HoloGovernor,
  HOLO_DETAILS,
  cheaperDetail,
  holoDetailSettings,
  holoItemDrawn,
} from "./holo-governor";
import { FxGovernor } from "./fx";
import { StepDownGovernor } from "./step-governor";
import type { HoloItem } from "./types";
import { DEMO_ROUTE } from "@waylit/core";

function run(
  governor: { recordFrame(t: number): void; evaluate(t: number): unknown },
  startMs: number,
  fps: number,
  seconds: number,
): number {
  let t = startMs;
  for (let i = 0; i < fps * seconds; i++) {
    t += 1000 / fps;
    governor.recordFrame(t);
    if (governor.evaluate(t) !== undefined) return t;
  }
  return t;
}

describe("detail ladder", () => {
  it("steps full, light, minimal and stops", () => {
    expect(cheaperDetail("full")).toBe("light");
    expect(cheaperDetail("light")).toBe("minimal");
    expect(cheaperDetail("minimal")).toBeUndefined();
    expect(HOLO_DETAILS).toEqual(["full", "light", "minimal"]);
  });

  it("draws fewer chevrons and then drops the rails as it gets cheaper", () => {
    expect(holoDetailSettings("full")).toEqual({ chevronStride: 1, rails: true });
    expect(holoDetailSettings("light")).toEqual({ chevronStride: 2, rails: true });
    expect(holoDetailSettings("minimal")).toEqual({ chevronStride: 4, rails: false });
  });
});

describe("HoloGovernor", () => {
  it("starts at full and holds at a steady 30 fps", () => {
    const governor = new HoloGovernor();
    expect(governor.level).toBe("full");
    run(governor, 0, 30, 60);
    expect(governor.level).toBe("full");
  });

  it("steps down to light, then minimal, when the median is below 30 fps, and stops there", () => {
    const governor = new HoloGovernor();
    let t = run(governor, 0, 20, 30);
    expect(governor.level).toBe("light");
    t = run(governor, t, 20, 30);
    expect(governor.level).toBe("minimal");
    run(governor, t, 10, 30);
    expect(governor.level).toBe("minimal");
  });

  it("needs enough frames and settling time before judging", () => {
    const governor = new HoloGovernor();
    run(governor, 0, 20, 2);
    expect(governor.level).toBe("full");
  });

  it("never steps back up when the frame rate recovers", () => {
    const governor = new HoloGovernor();
    const t = run(governor, 0, 20, 30);
    expect(governor.level).toBe("light");
    run(governor, t, 60, 60);
    expect(governor.level).toBe("light");
  });

  it("waits after a reset, so another change can show its effect first", () => {
    const governor = new HoloGovernor();
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += 50;
      governor.recordFrame(t);
    }
    governor.reset();
    expect(governor.evaluate(t + 50)).toBeUndefined();
    expect(governor.level).toBe("full");
  });

  it("is the same class of governor as the effect one, with its own ladder", () => {
    expect(new HoloGovernor()).toBeInstanceOf(StepDownGovernor);
    expect(new FxGovernor("high")).toBeInstanceOf(StepDownGovernor);
  });

  it("can start lower and be forced", () => {
    const governor = new HoloGovernor("light");
    expect(governor.level).toBe("light");
    governor.set("minimal");
    expect(governor.level).toBe("minimal");
  });
});

describe("thinning chevrons", () => {
  const guide = new RouteGuide(DEMO_ROUTE);
  const chevrons = (along: number): HoloItem[] => {
    const start = guide.pointAt(along);
    return guide
      .frame(start.position, start.headingDegrees, 0)
      .items.filter((i) => i.kind === "chevron");
  };

  it("keeps every chevron at full and about half and a quarter on the way down", () => {
    const all = chevrons(40);
    const light = all.filter((i) => holoItemDrawn(i, "light"));
    const minimal = all.filter((i) => holoItemDrawn(i, "minimal"));
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(all.every((i) => holoItemDrawn(i, "full"))).toBe(true);
    expect(light.length).toBeLessThan(all.length);
    expect(light.length).toBeGreaterThanOrEqual(Math.floor(all.length / 2) - 1);
    expect(minimal.length).toBeLessThan(light.length);
    expect(minimal.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the same chevrons when the rider moves, so nothing flickers", () => {
    const slotsAt = (along: number) =>
      chevrons(along)
        .filter((i) => holoItemDrawn(i, "light"))
        .map((i) => i.slot);
    const a = slotsAt(40);
    const b = slotsAt(47);
    const common = a.filter((slot) => b.includes(slot));
    expect(common.length).toBeGreaterThan(2);
    for (const slot of a.concat(b)) expect((slot ?? 1) % 2).toBe(0);
  });

  it("never drops the rider, heading marker or beacon", () => {
    const rider: HoloItem = {
      kind: "rider",
      position: { lat: 0, lng: 0 },
      headingDegrees: 0,
      scale: 1,
      alpha: 1,
      pulse: 0,
      liftMetres: 0,
    };
    for (const kind of ["rider", "heading", "beacon"] as const) {
      expect(holoItemDrawn({ ...rider, kind }, "minimal")).toBe(true);
    }
  });
});
