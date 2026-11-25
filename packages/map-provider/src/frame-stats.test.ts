import { describe, expect, it } from "vitest";
import { FrameLimiter, FrameStats, percentile } from "./frame-stats";

function feed(stats: FrameStats, startMs: number, frameMs: number, count: number): number {
  let t = startMs;
  stats.record(t);
  for (let i = 0; i < count; i++) {
    t += frameMs;
    stats.record(t);
  }
  return t;
}

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.99)).toBe(99);
    expect(percentile(values, 1)).toBe(100);
    expect(percentile([7], 0.99)).toBe(7);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("FrameStats", () => {
  it("reports zeros before any frame", () => {
    const stats = new FrameStats();
    expect(stats.summary(0)).toEqual({
      currentFps: 0,
      medianFps: 0,
      onePercentLowFps: 0,
      lastFrameMs: 0,
      sampleCount: 0,
    });
  });

  it("reports a steady 30 fps as 30 for all three figures", () => {
    const stats = new FrameStats();
    const end = feed(stats, 1000, 1000 / 30, 300);
    const summary = stats.summary(end);
    expect(summary.currentFps).toBeCloseTo(30, 0);
    expect(summary.medianFps).toBeCloseTo(30, 5);
    expect(summary.onePercentLowFps).toBeCloseTo(30, 5);
    expect(summary.lastFrameMs).toBeCloseTo(33.33, 1);
  });

  it("finds the 1 percent low when a few frames are slow", () => {
    const stats = new FrameStats();
    let t = 0;
    stats.record(t);
    // 98 fast frames at 20 ms and 2 slow ones at 100 ms.
    for (let i = 0; i < 100; i++) {
      t += i === 40 || i === 70 ? 100 : 20;
      stats.record(t);
    }
    const summary = stats.summary(t);
    expect(summary.medianFps).toBeCloseTo(50, 5);
    expect(summary.onePercentLowFps).toBeCloseTo(10, 5);
  });

  it("only keeps the last 60 seconds", () => {
    const stats = new FrameStats();
    // 30 seconds of a slow 10 fps, then 70 seconds of 60 fps.
    let end = feed(stats, 0, 100, 300);
    end = feed(stats, end, 1000 / 60, 4200);
    const summary = stats.summary(end);
    expect(summary.medianFps).toBeCloseTo(60, 3);
    expect(summary.onePercentLowFps).toBeCloseTo(60, 3);
  });

  it("does not count a pause as a slow frame", () => {
    const stats = new FrameStats();
    let end = feed(stats, 0, 33, 60);
    stats.breakSequence();
    end = feed(stats, end + 600_000, 33, 60);
    const summary = stats.summary(end);
    expect(summary.onePercentLowFps).toBeCloseTo(1000 / 33, 3);
  });

  it("ignores a gap longer than the pause limit even without a break", () => {
    const stats = new FrameStats();
    let t = feed(stats, 0, 20, 10);
    t += 30_000;
    stats.record(t);
    expect(stats.summary(t).onePercentLowFps).toBeCloseTo(50, 5);
  });

  it("measures the current rate over the last second only", () => {
    const stats = new FrameStats();
    let end = feed(stats, 0, 16.7, 600);
    end = feed(stats, end, 50, 20);
    expect(stats.summary(end).currentFps).toBeCloseTo(20, 0);
    expect(stats.summary(end).medianFps).toBeGreaterThan(55);
  });

  it("resets", () => {
    const stats = new FrameStats();
    const end = feed(stats, 0, 20, 10);
    stats.reset();
    expect(stats.summary(end).sampleCount).toBe(0);
  });
});

describe("FrameLimiter", () => {
  it("draws every other refresh of a 60 Hz display at 30 fps", () => {
    const limiter = new FrameLimiter(30);
    let drawn = 0;
    for (let i = 0; i < 600; i++) {
      if (limiter.shouldDraw(i * (1000 / 60))) drawn += 1;
    }
    // 10 seconds at 30 fps.
    expect(drawn).toBe(300);
  });

  it("draws every third refresh of a 90 Hz display at 30 fps", () => {
    const limiter = new FrameLimiter(30);
    let drawn = 0;
    for (let i = 0; i < 900; i++) {
      if (limiter.shouldDraw(i * (1000 / 90))) drawn += 1;
    }
    expect(drawn).toBe(300);
  });

  it("draws the first frame at once and after a reset", () => {
    const limiter = new FrameLimiter(10);
    expect(limiter.shouldDraw(5000)).toBe(true);
    expect(limiter.shouldDraw(5016)).toBe(false);
    limiter.reset();
    expect(limiter.shouldDraw(5017)).toBe(true);
  });

  it("changes rate", () => {
    const limiter = new FrameLimiter(10);
    limiter.setTarget(60);
    expect(limiter.target).toBe(60);
    expect(limiter.shouldDraw(0)).toBe(true);
    expect(limiter.shouldDraw(16.7)).toBe(true);
  });
});
