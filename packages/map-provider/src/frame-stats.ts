import type { FrameStatsSummary } from "./types";

/**
 * Frame timing for the dev overlay: the current frame rate, the median over the last 60
 * seconds and the 1 percent low, so the first number from a real phone can be read off the
 * screen. It reads no clock. The caller passes in the time of each frame in milliseconds.
 *
 * Definitions:
 *   current    frames in the last second divided by the time they took
 *   median     1000 divided by the median frame time over the window
 *   1% low     1000 divided by the 99th percentile frame time over the window, so it is the
 *              frame rate of the slowest one frame in a hundred
 */
export class FrameStats {
  private readonly windowMs: number;
  private readonly maxGapMs: number;
  private times: number[] = [];
  private deltas: number[] = [];
  private head = 0;
  private lastMs: number | undefined;

  /**
   * @param windowMs How much history to keep. Default 60 seconds.
   * @param maxGapMs A gap longer than this is a pause, not a slow frame, and is not counted.
   */
  constructor(windowMs = 60_000, maxGapMs = 5_000) {
    this.windowMs = windowMs;
    this.maxGapMs = maxGapMs;
  }

  /** Records that a frame was drawn at `nowMs`. */
  record(nowMs: number): void {
    const last = this.lastMs;
    this.lastMs = nowMs;
    if (last === undefined) return;
    const delta = nowMs - last;
    if (delta <= 0 || delta > this.maxGapMs) return;
    this.times.push(nowMs);
    this.deltas.push(delta);
    this.prune(nowMs);
  }

  /** Call when rendering stops (a hidden tab, a paused scene), so the gap is not a slow frame. */
  breakSequence(): void {
    this.lastMs = undefined;
  }

  /** Forgets everything. */
  reset(): void {
    this.times = [];
    this.deltas = [];
    this.head = 0;
    this.lastMs = undefined;
  }

  summary(nowMs: number): FrameStatsSummary {
    this.prune(nowMs);
    const count = this.times.length - this.head;
    if (count === 0) {
      return { currentFps: 0, medianFps: 0, onePercentLowFps: 0, lastFrameMs: 0, sampleCount: 0 };
    }
    const window = this.deltas.slice(this.head);
    const sorted = [...window].sort((a, b) => a - b);
    const median = percentile(sorted, 0.5);
    const slowest = percentile(sorted, 0.99);

    let recentCount = 0;
    let recentMs = 0;
    for (let i = this.times.length - 1; i >= this.head; i--) {
      if ((this.times[i] ?? 0) <= nowMs - 1000) break;
      recentCount += 1;
      recentMs += this.deltas[i] ?? 0;
    }
    return {
      currentFps: recentMs > 0 ? (recentCount * 1000) / recentMs : 0,
      medianFps: median > 0 ? 1000 / median : 0,
      onePercentLowFps: slowest > 0 ? 1000 / slowest : 0,
      lastFrameMs: this.deltas[this.deltas.length - 1] ?? 0,
      sampleCount: count,
    };
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    while (this.head < this.times.length && (this.times[this.head] ?? 0) < cutoff) this.head += 1;
    // Compact now and then so the arrays do not grow without bound.
    if (this.head > 2048) {
      this.times = this.times.slice(this.head);
      this.deltas = this.deltas.slice(this.head);
      this.head = 0;
    }
  }
}

/** The value at fraction `p` (0 to 1) of an ascending list, by the nearest rank method. */
export function percentile(sortedAscending: readonly number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const rank = Math.min(sortedAscending.length, Math.max(1, Math.ceil(p * sortedAscending.length)));
  return sortedAscending[rank - 1] ?? 0;
}

/**
 * Decides which animation frames to draw so a scene runs at a target rate. A phone screen
 * refreshes at 60 or 120 Hz, and drawing every refresh costs battery and heat for no gain at
 * 30 fps. Feed it each frame time and draw when it says so.
 */
export class FrameLimiter {
  private targetFps: number;
  private lastDrawMs: number | undefined;
  /** Frame times land on display refreshes, so allow a little early. */
  private readonly toleranceMs = 2;

  constructor(targetFps: number) {
    this.targetFps = Math.max(1, targetFps);
  }

  setTarget(targetFps: number): void {
    this.targetFps = Math.max(1, targetFps);
  }

  get target(): number {
    return this.targetFps;
  }

  shouldDraw(nowMs: number): boolean {
    const last = this.lastDrawMs;
    if (last === undefined || nowMs - last >= 1000 / this.targetFps - this.toleranceMs) {
      this.lastDrawMs = nowMs;
      return true;
    }
    return false;
  }

  /** Forget the last drawn frame, so the next frame draws at once. */
  reset(): void {
    this.lastDrawMs = undefined;
  }
}
