import { FxGovernor, type FxLevel } from "./fx";
import { HoloGovernor, type HoloDetail } from "./holo-governor";
import type { StepGovernorOptions } from "./step-governor";

/** What changed on one evaluation. At most one of the two fields is set. */
export interface LoadChange {
  readonly fx?: FxLevel;
  readonly holo?: HoloDetail;
}

/**
 * One place that decides which optional work to drop when the frame rate is low. Two ladders:
 * the screen effect (`FxGovernor`, high to low to off) and the hologram objects (`HoloGovernor`,
 * full to light to minimal).
 *
 * Order: the screen effect is a full screen pass, so it goes first. Only when it is off, or
 * pinned by the address, or was never on (the default in Google mode), does the hologram step
 * down. Each evaluation makes at most one change, and a change restarts both judgements so the
 * next step is judged on what the last one achieved. Both only ever step down.
 */
export class LoadGovernor {
  private readonly fx: FxGovernor;
  private readonly holo: HoloGovernor;

  /**
   * @param fxPinned True when the address pinned the effect level (`?fx=`). That stops the effect
   *   ladder, and the hologram ladder still runs.
   */
  constructor(
    fxLevel: FxLevel,
    private readonly fxPinned: boolean,
    detail: HoloDetail = "full",
    options: StepGovernorOptions = {},
  ) {
    this.fx = new FxGovernor(fxLevel, options);
    this.holo = new HoloGovernor(detail, options);
  }

  get fxLevel(): FxLevel {
    return this.fx.level;
  }

  get holoDetail(): HoloDetail {
    return this.holo.level;
  }

  private get fxRuns(): boolean {
    return !this.fxPinned && this.fx.level !== "off";
  }

  /** Feeds the time of a drawn frame. Call only while riding. */
  recordFrame(nowMs: number): void {
    if (this.fxRuns) this.fx.recordFrame(nowMs);
    this.holo.recordFrame(nowMs);
  }

  /** Forget the history, for a pause or a new ride. */
  reset(): void {
    this.fx.reset();
    this.holo.reset();
  }

  /** The change to make now, if any. */
  evaluate(nowMs: number): LoadChange | undefined {
    if (this.fxRuns) {
      const level = this.fx.evaluate(nowMs);
      if (level !== undefined) {
        this.holo.reset();
        return { fx: level };
      }
      // While the effect can still step down it is judged first, so the hologram waits.
      return undefined;
    }
    const detail = this.holo.evaluate(nowMs);
    return detail === undefined ? undefined : { holo: detail };
  }
}
