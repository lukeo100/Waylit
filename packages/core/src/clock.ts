/** A source of time that tests can replace. Returns milliseconds since the Unix epoch. */
export interface Clock {
  now(): number;
}

/** The real clock. */
export const systemClock: Clock = { now: () => Date.now() };

/** A clock that only moves when told to. Use it to make simulations deterministic in tests. */
export interface ManualClock extends Clock {
  /** Moves time forward by `ms` milliseconds. */
  advance(ms: number): void;
  /** Sets the absolute time. */
  set(ms: number): void;
}

export function createManualClock(startMs = 0): ManualClock {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
    set: (ms) => {
      current = ms;
    },
  };
}

/**
 * The timer functions a caller can offer so an adapter can run itself. Shared packages have
 * no DOM types, so they never reach for the global timers. Apps pass their own.
 */
export interface Scheduler {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}
