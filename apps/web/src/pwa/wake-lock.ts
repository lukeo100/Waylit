/**
 * Screen Wake Lock for the riding screen.
 *
 * The browser releases a wake lock whenever the page is hidden, so the controller asks
 * again when the page becomes visible. Everything is feature detected and failures are
 * swallowed: a missing or refused lock must never break the ride screen.
 * Browser support: https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API
 */

export type WakeLockStatus = "unsupported" | "inactive" | "active";

/** The slice of the browser the controller needs, so tests can supply fakes. */
export interface WakeLockEnvironment {
  readonly wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } | undefined;
  readonly document?: WakeLockDocumentLike | undefined;
}

export interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

export interface WakeLockDocumentLike {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface WakeLockController {
  /** Start holding a wake lock. Safe to call more than once. */
  start(): void;
  /** Release the lock and stop re-acquiring it. */
  stop(): void;
  getStatus(): WakeLockStatus;
  subscribe(listener: () => void): () => void;
}

function browserEnvironment(): WakeLockEnvironment {
  if (typeof navigator === "undefined" || typeof document === "undefined") return {};
  return {
    wakeLock: "wakeLock" in navigator ? navigator.wakeLock : undefined,
    document,
  };
}

export function isWakeLockSupported(env: WakeLockEnvironment = browserEnvironment()): boolean {
  return Boolean(env.wakeLock) && typeof env.wakeLock?.request === "function";
}

export function createWakeLockController(
  getEnvironment: () => WakeLockEnvironment = browserEnvironment,
): WakeLockController {
  const listeners = new Set<() => void>();
  let wanted = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let requesting = false;
  let doc: WakeLockDocumentLike | undefined;
  let status: WakeLockStatus = isWakeLockSupported(getEnvironment()) ? "inactive" : "unsupported";

  function setStatus(next: WakeLockStatus): void {
    if (status === next) return;
    status = next;
    for (const listener of listeners) listener();
  }

  async function acquire(): Promise<void> {
    const env = getEnvironment();
    const provider = env.wakeLock;
    if (!wanted || sentinel || requesting || !provider) return;
    if (env.document && env.document.visibilityState !== "visible") return;
    requesting = true;
    try {
      const lock = await provider.request("screen");
      if (!wanted) {
        // Stopped while the request was in flight.
        await lock.release().catch(() => undefined);
        return;
      }
      sentinel = lock;
      lock.addEventListener("release", () => {
        // Fired when the browser takes the lock back, for example when the page is hidden.
        if (sentinel === lock) sentinel = null;
        setStatus("inactive");
      });
      setStatus("active");
    } catch {
      // Refused, for example by battery saver. Try again on the next visibility change.
      setStatus("inactive");
    } finally {
      requesting = false;
    }
  }

  function onVisibilityChange(): void {
    if (doc?.visibilityState === "visible") void acquire();
  }

  return {
    start() {
      if (wanted) return;
      const env = getEnvironment();
      if (!isWakeLockSupported(env)) {
        setStatus("unsupported");
        return;
      }
      wanted = true;
      doc = env.document;
      doc?.addEventListener("visibilitychange", onVisibilityChange);
      void acquire();
    },
    stop() {
      if (!wanted) return;
      wanted = false;
      doc?.removeEventListener("visibilitychange", onVisibilityChange);
      doc = undefined;
      const held = sentinel;
      sentinel = null;
      if (held) void held.release().catch(() => undefined);
      setStatus(isWakeLockSupported(getEnvironment()) ? "inactive" : "unsupported");
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
