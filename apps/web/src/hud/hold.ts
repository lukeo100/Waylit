/**
 * Press and hold logic for guarded controls. Holding for the set time counts as one press;
 * letting go early does nothing. It takes its timer functions as arguments so tests can run
 * it with fake timers, and it knows nothing about React.
 */

export interface HoldTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface HoldController {
  /** Starts a hold. Does nothing if one is already running. */
  begin(): void;
  /** Cancels a hold that has not finished. */
  cancel(): void;
  readonly holding: boolean;
}

export interface HoldOptions {
  readonly holdMs: number;
  readonly timers: HoldTimers;
  /** Called once when the hold completes. */
  readonly onComplete: () => void;
  /** Called when a hold starts or stops, so the UI can show progress. */
  readonly onChange?: (holding: boolean) => void;
}

export function createHoldController(options: HoldOptions): HoldController {
  let handle: unknown;
  let holding = false;

  const setHolding = (next: boolean): void => {
    if (holding === next) return;
    holding = next;
    options.onChange?.(next);
  };

  return {
    begin() {
      if (holding) return;
      setHolding(true);
      handle = options.timers.setTimeout(() => {
        handle = undefined;
        setHolding(false);
        options.onComplete();
      }, options.holdMs);
    },
    cancel() {
      if (!holding) return;
      options.timers.clearTimeout(handle);
      handle = undefined;
      setHolding(false);
    },
    get holding() {
      return holding;
    },
  };
}
