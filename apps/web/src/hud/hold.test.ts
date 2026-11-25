import { afterEach, describe, expect, it, vi } from "vitest";
import { createHoldController } from "./hold";
import { devControlsEnabled, parseTimeOverride, PLAYBACK_SPEEDS } from "./dev-controls";
import { DEFAULT_SUN_POSITION, computeDaylight } from "./daylight";

const timers = {
  setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("hold to press", () => {
  function make() {
    vi.useFakeTimers();
    const events: string[] = [];
    const controller = createHoldController({
      holdMs: 600,
      timers,
      onComplete: () => events.push("done"),
      onChange: (holding) => events.push(holding ? "start" : "stop"),
    });
    return { controller, events };
  }

  it("completes once after the hold time", () => {
    const { controller, events } = make();
    controller.begin();
    expect(controller.holding).toBe(true);
    vi.advanceTimersByTime(599);
    expect(events).toEqual(["start"]);
    vi.advanceTimersByTime(1);
    expect(events).toEqual(["start", "stop", "done"]);
    expect(controller.holding).toBe(false);
  });

  it("does nothing when let go early", () => {
    const { controller, events } = make();
    controller.begin();
    vi.advanceTimersByTime(300);
    controller.cancel();
    vi.advanceTimersByTime(1000);
    expect(events).toEqual(["start", "stop"]);
  });

  it("ignores a second begin and a cancel with nothing running", () => {
    const { controller, events } = make();
    controller.cancel();
    controller.begin();
    controller.begin();
    vi.advanceTimersByTime(600);
    expect(events.filter((e) => e === "done")).toHaveLength(1);
  });
});

describe("dev controls flag", () => {
  it("shows in development and test builds", () => {
    expect(devControlsEnabled("", "development")).toBe(true);
    expect(devControlsEnabled("", undefined)).toBe(true);
  });

  it("is hidden in production unless the address asks for it", () => {
    expect(devControlsEnabled("", "production")).toBe(false);
    expect(devControlsEnabled("?dev=0", "production")).toBe(false);
    expect(devControlsEnabled("?x=1&dev=1", "production")).toBe(true);
  });

  it("offers playback speeds starting at normal", () => {
    expect(PLAYBACK_SPEEDS[0]).toBe(1);
  });
});

describe("time override in the address", () => {
  const now = Date.UTC(2026, 5, 21, 9, 0);

  it("reads a date and time with an offset", () => {
    expect(parseTimeOverride("?dev=1&time=2026-12-21T16:30:00Z", DEFAULT_SUN_POSITION, now)).toBe(
      Date.UTC(2026, 11, 21, 16, 30),
    );
    expect(parseTimeOverride("?time=2026-12-21T17:30+01:00", DEFAULT_SUN_POSITION, undefined)).toBe(
      Date.UTC(2026, 11, 21, 16, 30),
    );
  });

  it("reads a preset on the real date at the rider's place", () => {
    for (const [name, isDay] of [
      ["noon", true],
      ["night", false],
    ] as const) {
      const ms = parseTimeOverride(`?time=${name}`, DEFAULT_SUN_POSITION, now);
      expect(ms).toBeDefined();
      expect(computeDaylight(DEFAULT_SUN_POSITION, ms ?? 0).isDay).toBe(isDay);
    }
    expect(parseTimeOverride("?time=sunset", DEFAULT_SUN_POSITION, undefined)).toBeUndefined();
  });

  it("ignores anything it cannot read, including a time with no offset", () => {
    for (const search of ["", "?time=", "?time=lunch", "?time=2026-12-21T16:30:00", "?time=1"]) {
      expect(parseTimeOverride(search, DEFAULT_SUN_POSITION, now)).toBeUndefined();
    }
  });
});
