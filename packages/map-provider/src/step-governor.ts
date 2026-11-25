import { FrameStats } from "./frame-stats";

/**
 * Options for a governor. `downgradeBelowFps` defaults to 30 less the frame limiter's 2 ms
 * tolerance, so a steady 30 fps does not count as slow. `minSamples` frames and `settleMs` of
 * running at a level are needed before it judges that level.
 */
export interface StepGovernorOptions {
  downgradeBelowFps?: number;
  minSamples?: number;
  settleMs?: number;
}

/**
 * Picks how much optional work to do from the measured frame rate. It starts at the level it is
 * given and only ever steps down, one level at a time, when the median frame rate since the last
 * change is below the threshold, so a phone that cannot keep up stops paying for the extras. It
 * never steps back up, which keeps it from flipping. Frame times go through the same `FrameStats`
 * as the dev overlay. `FxGovernor` (the screen effect) and `HoloGovernor` (the hologram objects)
 * are both this class with their own ladder of levels.
 */
export class StepDownGovernor<L> {
  private current: L;
  private readonly stats = new FrameStats(10_000);
  private changedAtMs: number | undefined;
  private readonly minSamples: number;
  private readonly settleMs: number;
  private readonly downgradeBelowFps: number;

  /**
   * @param initial Where to start.
   * @param cheaper The next cheaper level, or undefined from the cheapest one.
   */
  constructor(
    initial: L,
    private readonly cheaper: (level: L) => L | undefined,
    options: StepGovernorOptions = {},
  ) {
    this.current = initial;
    this.downgradeBelowFps = options.downgradeBelowFps ?? 1000 / (1000 / 30 + 2);
    this.minSamples = options.minSamples ?? 90;
    this.settleMs = options.settleMs ?? 4_000;
  }

  get level(): L {
    return this.current;
  }

  /** Feeds the time of a drawn frame. Call only while riding. */
  recordFrame(nowMs: number): void {
    if (this.changedAtMs === undefined) this.changedAtMs = nowMs;
    this.stats.record(nowMs);
  }

  /** Forget the history, for a pause or a new ride, or to wait and see what another change did. */
  reset(): void {
    this.stats.reset();
    this.changedAtMs = undefined;
  }

  /** Returns the new level if it should change, otherwise undefined. */
  evaluate(nowMs: number): L | undefined {
    const next = this.cheaper(this.current);
    if (next === undefined) return undefined;
    const summary = this.stats.summary(nowMs);
    if (summary.sampleCount < this.minSamples) return undefined;
    if (this.changedAtMs === undefined || nowMs - this.changedAtMs < this.settleMs)
      return undefined;
    if (summary.medianFps >= this.downgradeBelowFps) return undefined;
    this.current = next;
    this.stats.reset();
    this.changedAtMs = nowMs;
    return next;
  }

  /** Forces a level, for a manual override. Starts a fresh judgement. */
  set(level: L): void {
    this.current = level;
    this.reset();
  }
}
